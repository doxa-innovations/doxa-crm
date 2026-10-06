"""Apply the same visibility rules to report tables as operational record queries.

Scoped subqueries also cover nested aggregates and exports; query parameters can
never widen the authenticated user's record scope. No global SQL state is used.
"""
from sqlalchemy import select, false
from sqlalchemy.sql import visitors
from app.models import Activity, Lead, Contact, Deal, Task, Account, ReportSnapshot, SalesQuota
from app.auth.permissions import SALES_REP, role_value, is_manager
from app.services.accounts import account_visibility_filter


class ReportSession:
    def __init__(self, session, user, currency="USD"):
        self.session = session
        self.replacements = {}
        conditions = {ReportSnapshot: [false()], Deal: [Deal.currency == currency], SalesQuota: [SalesQuota.currency == currency]}
        for model in (Lead, Contact, Deal, Account):
            conditions.setdefault(model, []).append(model.is_active.is_(True))
        if role_value(user) == SALES_REP:
            for model, column in ((Lead, Lead.assigned_to), (Contact, Contact.owner_id), (Deal, Deal.owner_id)):
                conditions.setdefault(model, []).append(column == user.id)
            conditions[Account].append(account_visibility_filter(user))
        if not is_manager(user):
            conditions[Task] = [Task.owner_id == user.id]
            conditions[Activity] = [Activity.owner_id == user.id]
            conditions[SalesQuota].append(SalesQuota.user_id == user.id)
            # Global snapshots cannot represent an individual user's scope.
            conditions[ReportSnapshot] = [false()]
        for model, filters in conditions.items():
            table = model.__table__
            scoped = select(table).where(*filters).subquery(f"visible_{table.name}")
            self.replacements[table] = scoped
            for column in table.c:
                self.replacements[column] = scoped.c[column.name]

    async def execute(self, statement, *args, **kwargs):
        scoped = visitors.replacement_traverse(statement, {}, lambda element: self.replacements.get(element))
        return await self.session.execute(scoped, *args, **kwargs)
