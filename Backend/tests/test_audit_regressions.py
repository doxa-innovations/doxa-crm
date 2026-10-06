from types import SimpleNamespace
from uuid import uuid4
from datetime import date, datetime, timezone, timedelta
import pytest
from fastapi import HTTPException
from app.services.email_preferences import unsubscribe_token, read_unsubscribe_token
from app.services import storage
from app.utils import email, mailersend_email
from app.workers import campaign_tasks
from app.models import CampaignStatus, CampaignEnrollmentStatus, CampaignSequenceChannel
from tests.test_campaigns import FakeSession, FakeResult

@pytest.mark.asyncio
async def test_storage_without_provider_fails_instead_of_fabricating_url(monkeypatch):
    monkeypatch.setattr(storage,'_settings_have_r2_credentials',lambda:False)
    with pytest.raises(HTTPException) as exc:
        await storage.upload_project_document(project_id=uuid4(),filename='test.txt',content=b'bytes',content_type='text/plain')
    assert exc.value.status_code==503

def test_unconfigured_email_is_failure(monkeypatch):
    monkeypatch.setattr(email,'get_settings',lambda:SimpleNamespace(resend_api_key=''))
    monkeypatch.setattr(mailersend_email,'get_settings',lambda:SimpleNamespace(mailersend_api_key=''))
    assert email.send_email('qa@example.test','test','body') is False
    assert mailersend_email.send_email('qa@example.test','test','body') is False

def test_unsubscribe_signature_cannot_be_reused_for_another_contact():
    identifier=uuid4();token=unsubscribe_token(identifier)
    assert read_unsubscribe_token(token)==identifier
    assert read_unsubscribe_token(str(uuid4())+'.'+token.split('.')[1]) is None

@pytest.mark.asyncio
async def test_campaign_waits_for_start_date(monkeypatch):
    enrollment=SimpleNamespace(id=uuid4(),campaign_id=uuid4(),contact_id=uuid4(),step_index=0,status=CampaignEnrollmentStatus.active)
    campaign=SimpleNamespace(status=CampaignStatus.active,start_date=date.today()+timedelta(days=2),end_date=date.today()+timedelta(days=5))
    db=FakeSession([FakeResult(value=enrollment),FakeResult(value=campaign)])
    scheduled=[]
    monkeypatch.setattr(campaign_tasks,'AsyncSessionLocal',lambda:db)
    monkeypatch.setattr(campaign_tasks.process_campaign_step,'apply_async',lambda **kw:scheduled.append(kw))
    result=await campaign_tasks._process_campaign_step(enrollment.id,0)
    assert result['reason']=='campaign_start_date'
    assert scheduled[0]['countdown']>86400
    assert not db.added

@pytest.mark.asyncio
async def test_opted_out_email_never_reaches_transport(monkeypatch):
    contact=SimpleNamespace(email_opted_out_at=datetime.now(timezone.utc))
    step=SimpleNamespace(channel=CampaignSequenceChannel.email,body='body',subject='Subject')
    async def fail(*args):raise AssertionError('Transport must not be called')
    monkeypatch.setattr(campaign_tasks,'send_email_via_mailersend',fail)
    result=await campaign_tasks.send_campaign_step_message(contact,step)
    assert not result.delivered
    assert result.reason=='email_opted_out'


@pytest.mark.asyncio
async def test_first_campaign_step_delay_is_observed(monkeypatch):
    now = datetime.now(timezone.utc)
    enrollment = SimpleNamespace(id=uuid4(), campaign_id=uuid4(), contact_id=uuid4(), step_index=0, status=CampaignEnrollmentStatus.active, enrolled_at=now)
    campaign = SimpleNamespace(status=CampaignStatus.active, start_date=now.date(), end_date=(now+timedelta(days=10)).date())
    step = SimpleNamespace(delay_days=2)
    db = FakeSession([FakeResult(value=enrollment), FakeResult(value=campaign), FakeResult(value=SimpleNamespace()), FakeResult(value=step)])
    scheduled = []
    monkeypatch.setattr(campaign_tasks, "AsyncSessionLocal", lambda: db)
    monkeypatch.setattr(campaign_tasks.process_campaign_step, "apply_async", lambda **kwargs: scheduled.append(kwargs))
    result = await campaign_tasks._process_campaign_step(enrollment.id, 0)
    assert result["reason"] == "first_step_delay"
    assert 172790 < scheduled[0]["countdown"] <= 172800
    assert not db.added

@pytest.mark.asyncio
async def test_manual_campaign_step_waits_for_task_and_does_not_count_as_sent(monkeypatch):
    from app.models import TaskStatus
    now = datetime.now(timezone.utc)
    enrollment = SimpleNamespace(id=uuid4(), campaign_id=uuid4(), contact_id=uuid4(), step_index=0, status=CampaignEnrollmentStatus.active)
    campaign = SimpleNamespace(id=enrollment.campaign_id, status=CampaignStatus.active, start_date=now.date(), end_date=now.date())
    contact = SimpleNamespace(id=enrollment.contact_id, owner_id=uuid4())
    step = SimpleNamespace(id=uuid4(), delay_days=0, channel=CampaignSequenceChannel.call)
    task = SimpleNamespace(id=uuid4(), status=TaskStatus.pending)
    db = FakeSession([FakeResult(value=enrollment), FakeResult(value=campaign), FakeResult(value=contact), FakeResult(value=step), FakeResult(value=task)])
    scheduled=[]
    monkeypatch.setattr(campaign_tasks, "AsyncSessionLocal", lambda: db)
    monkeypatch.setattr(campaign_tasks.process_campaign_step, "apply_async", lambda **kwargs: scheduled.append(kwargs))
    result=await campaign_tasks._process_campaign_step(enrollment.id, 0)
    assert result["reason"] == "manual_task"
    assert enrollment.step_index == 0
    assert scheduled[0]["countdown"] == 300
    assert not db.added


def test_custom_report_rejects_invalid_typed_filters():
    from app.services.reports import _custom_filter_condition, leads
    with pytest.raises(HTTPException) as error:
        _custom_filter_condition(leads.c.assigned_to, "eq", "not-a-uuid")
    assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        _custom_filter_condition(leads.c.score, "contains", "text")


def test_shared_company_does_not_make_unrelated_names_duplicates():
    from app.services.duplicate_detection import _fuzzy_score
    company="A very long company name shared by many unrelated customers"
    assert _fuzzy_score({"full_name":"Ada Lovelace","company":company},{"full_name":"Grace Hopper","company":company}) == 0
    assert _fuzzy_score({"full_name":"Ada Lovelace","company":company},{"full_name":"Adaa Lovelace","company":company}) >= 0.85


def test_duplicate_candidates_keep_near_names_and_exact_identifiers():
    from app.services.duplicate_detection import DuplicateIndex
    one=SimpleNamespace(id=uuid4(),full_name="Ada Lovelace",company="Acme",email="ada@example.test",phone="123")
    two=SimpleNamespace(id=uuid4(),full_name="Grace Hopper",company="Acme",email="grace@example.test",phone="456")
    index=DuplicateIndex([one,two])
    assert one in index.candidates({"full_name":"Adaa Lovelace","email":"new@example.test","phone":"789"})
    assert two in index.candidates({"full_name":"Completely different","email":"grace@example.test","phone":"789"})

@pytest.mark.asyncio
async def test_duplicate_listing_stops_after_requested_page(monkeypatch):
    from app.services import duplicate_detection as service
    from app.schemas.leads import DuplicateLeadPair
    records=[SimpleNamespace(id=uuid4(),full_name="Same name",email="same@example.test",phone="123",company="Acme") for _ in range(100)]
    db=FakeSession([FakeResult(values=records)])
    calls=[]
    def compare(left,right):
        calls.append((left.id,right.id))
        return DuplicateLeadPair(lead_id=left.id,duplicate_lead_id=right.id,similarity_score=1,reason="email")
    monkeypatch.setattr(service,"compare_leads",compare)
    result=await service.detect_duplicate_pairs(db,page=2,page_size=10)
    assert len(result)==10
    assert len(calls)==20
