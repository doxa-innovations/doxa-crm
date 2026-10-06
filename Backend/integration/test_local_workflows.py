"""Opt-in real HTTP tests. Requires a seeded disposable local stack, never production.
Run: CRM_INTEGRATION=1 .venv/bin/python -m pytest integration -q
"""
import os
import uuid
import time
import httpx
import pytest

pytestmark = pytest.mark.skipif(os.getenv('CRM_INTEGRATION') != '1', reason='Requires disposable localhost stack')
WEB='http://127.0.0.1:3105'
API='http://127.0.0.1:8105/api/v1'

def sign_in(client, email, password='DoxaDemo123!'):
    for attempt in range(4):
        response=client.post(WEB+'/api/auth/sign-in/email',json={'email':email,'password':password})
        if response.status_code != 429: return response
        time.sleep(min(60,max(1,int(response.headers.get('retry-after','10')))))
    return response

@pytest.fixture(scope='module')
def clients():
    result={}
    for role,email in [('admin','admin@doxa.local'),('rep','alex.rep@doxa.local'),('readonly','readonly@doxa.local')]:
        c=httpx.Client(timeout=60,headers={'Origin':WEB})
        r=sign_in(c,email)
        assert r.status_code==200,r.text
        token=c.get(WEB+'/api/auth/token').json()['token']
        c.headers['Authorization']='Bearer '+token
        result[role]=c
    yield result
    for c in result.values():c.close()

def lead_payload():
    return {'full_name':'QA '+str(uuid.uuid4())[:8],'email':str(uuid.uuid4())+'@example.test','phone':'+251911111111','company':'Local QA','source':'website'}

def test_real_identity_can_save_and_audit(clients):
    c=clients['admin'];r=c.post(API+'/leads/',json=lead_payload());assert r.status_code==201,r.text
    lead=r.json();r=c.patch(API+'/leads/'+lead['id'],json={'company':'Updated QA'});assert r.status_code==200,r.text
    history=c.get(API+'/workspace/history',params={'entity':'leads'});assert history.status_code==200,history.text
    assert any(row['record_id']==lead['id'] and row['actor']!='System' for row in history.json())

def test_scope_direct_reports_and_directory(clients):
    admin,rep=clients['admin'],clients['rep']
    lead=admin.post(API+'/leads/',json=lead_payload()).json()
    assert rep.get(API+'/leads/'+lead['id']).status_code==404
    assert rep.patch(API+'/leads/'+lead['id'],json={'company':'Forbidden'}).status_code==404
    r=rep.post(API+'/reports/custom',json={'entity':'leads','fields':['id','assigned_to']});assert r.status_code==200,r.text
    assert not any(row[0]==lead['id'] for row in r.json()['rows'])
    assert rep.get(API+'/users/directory').status_code==200
    assert rep.get(API+'/users/').status_code==403
    assert clients['readonly'].post(API+'/leads/',json=lead_payload()).status_code==403

@pytest.mark.parametrize('path',['/reports/dashboard','/reports/pipeline-summary','/reports/forecast','/reports/quota','/reports/lead-volume','/reports/lead-funnel','/reports/activity-volume','/reports/overdue-tasks','/reports/customer-health','/reports/renewal-pipeline','/projects/','/workspace/health'])
def test_read_routes(clients,path):
    r=clients['admin'].get(API+path);assert r.status_code==200,r.text

def test_invitation_single_use(clients):
    c=clients['admin'];email=str(uuid.uuid4())+'@example.test'
    r=c.post(API+'/users/',json={'email':email,'full_name':'Invited QA','role':'sales_rep'});assert r.status_code==201,r.text
    r=c.post(WEB+'/api/team/invite',json={'email':email});assert r.status_code==200,r.text
    token=r.json()['url'].split('token=')[1]
    with httpx.Client(headers={'Origin':WEB},timeout=60) as guest:
        r=guest.post(WEB+'/api/team/accept',json={'token':token,'password':'Local QA passphrase 42!'});assert r.status_code==200,r.text
        assert guest.post(WEB+'/api/team/accept',json={'token':token,'password':'Local QA passphrase 42!'}).status_code==410
        assert sign_in(guest,email,'Local QA passphrase 42!').status_code==200

def test_portal_revocation_and_missing_storage(clients):
    c=clients['admin'];r=c.get(API+'/projects/');assert r.status_code==200,r.text
    project=r.json()[0];path=API+'/projects/'+project['id']
    r=c.post(path+'/documents',files={'file':('qa.txt',b'local QA','text/plain')});assert r.status_code==503,r.text
    old=project['portal_token'];r=c.post(path+'/portal/rotate');assert r.status_code==200,r.text
    new=r.json()['portal_token'];assert new!=old
    assert c.get(API+'/portal/'+old).status_code==404
    assert c.get(API+'/portal/'+new).status_code==200
    assert c.patch(path,json={'portal_enabled':False}).status_code==200
    assert c.get(API+'/portal/'+new).status_code==404
    assert c.patch(path,json={'portal_enabled':True}).status_code==200

def test_preferences_and_restore(clients):
    c=clients['admin'];rep=clients['rep']
    key='qa-'+str(uuid.uuid4())
    assert c.put(API+'/workspace/preferences/'+key,json={'value':{'saved':True}}).status_code==200
    assert c.get(API+'/workspace/preferences/'+key).json()['value']=={'saved':True}
    assert rep.get(API+'/workspace/preferences/'+key).json()['value'] is None
    lead=c.post(API+'/leads/',json=lead_payload()).json();assert c.delete(API+'/leads/'+lead['id']).status_code==204
    assert c.get(API+'/leads/'+lead['id']).status_code==404
    assert c.post(API+'/workspace/archive/leads/'+lead['id']+'/restore').status_code==200
    assert c.get(API+'/leads/'+lead['id']).status_code==200


def test_task_activity_and_linked_record_scope(clients):
    admin, rep = clients['admin'], clients['rep']
    lead = admin.post(API+'/leads/', json=lead_payload()).json()
    task_payload = {'title':'Local scope QA','lead_id':lead['id']}
    assert rep.post(API+'/tasks/',json=task_payload).status_code == 404
    response=admin.post(API+'/tasks/',json=task_payload)
    assert response.status_code==201,response.text
    task=response.json()
    for suffix in ['', '/complete']:
        result=rep.get(API+'/tasks/'+task['id']) if not suffix else rep.post(API+'/tasks/'+task['id']+suffix)
        assert result.status_code==404,result.text
    assert admin.post(API+'/tasks/'+task['id']+'/complete').status_code==200
    activity_payload={'type':'note','subject':'Local QA','body':'Confidential note','lead_id':lead['id']}
    assert rep.post(API+'/activities/',json=activity_payload).status_code==404
    response=admin.post(API+'/activities/',json=activity_payload)
    assert response.status_code==201,response.text
    assert rep.get(API+'/activities/'+response.json()['id']).status_code==404

def test_custom_report_more_than_one_thousand_and_csv_import(clients):
    c=clients['admin'];marker='Bulk QA '+str(uuid.uuid4())
    rows=['full_name,email,phone,company,source']
    rows += [f'{uuid.uuid4()},{uuid.uuid4()}@example.test,+251{str(uuid.uuid4().int)[:12]},"{marker}, Ltd",website' for i in range(1006)]
    r=c.post(API+'/leads/import',files={'file':('leads.csv', '\n'.join(rows).encode(),'text/csv')})
    assert r.status_code==200,r.text
    assert r.json()['imported']==1006, {k:(v[:3] if isinstance(v,list) else v) for k,v in r.json().items()}
    report={'entity':'leads','fields':['id','full_name'],'filters':[{'field':'company','operator':'contains','value':marker}]}
    r=c.post(API+'/reports/custom',json=report)
    assert r.status_code==200,r.text
    assert r.json()['total']==1006
    assert len(r.json()['rows'])==1006
    page=c.get(API+'/leads/',params={'search':marker,'page_size':100,'page':11})
    assert page.status_code==200,page.text
    assert len(page.json())==6

def test_merge_preserves_linked_work(clients):
    c=clients['admin'];first=c.post(API+'/leads/',json=lead_payload()).json();second=c.post(API+'/leads/',json=lead_payload()).json()
    t=c.post(API+'/tasks/',json={'title':'Merge QA','lead_id':second['id']});assert t.status_code==201,t.text
    a=c.post(API+'/activities/',json={'type':'note','subject':'Merge note','body':'Keep this history','lead_id':second['id']});assert a.status_code==201,a.text
    merged=c.post(API+'/leads/merge',json={'primary_lead_id':first['id'],'duplicate_lead_id':second['id']});assert merged.status_code==200,merged.text
    assert c.get(API+'/tasks/'+t.json()['id']).json()['lead_id']==first['id']
    assert c.get(API+'/activities/'+a.json()['id']).json()['lead_id']==first['id']
    assert c.get(API+'/leads/'+second['id']).status_code==404

def test_currency_rollups_and_quota_conflict(clients):
    c=clients['admin'];deals=c.get(API+'/deals/',params={'page_size':100}).json();original=deals[0]
    foreign=c.patch(API+'/deals/'+original['id'],json={'currency':'ETB','value':'123.45'});assert foreign.status_code==200,foreign.text
    try:
        r=c.get(API+'/deals/forecast',params={'currency':'ETB'});assert r.status_code==200,r.text
        assert r.json()['currency']=='ETB'
        report=c.post(API+'/reports/custom?currency=USD',json={'entity':'deals','fields':['id','currency']});assert report.status_code==200,report.text
        assert all(row[1]=='USD' for row in report.json()['rows'])
        account=c.get(API+'/accounts/'+original['account_id']);assert account.status_code==200,account.text
        assert 'ETB' in account.json()['deal_values_by_currency']
    finally:
        c.patch(API+'/deals/'+original['id'],json={'currency':original['currency'],'value':original['value']})
    user=c.get(API+'/users/me').json()
    quota={'user_id':user['id'],'period_start':'2090-01-01','period_end':'2090-01-31','quota_amount':'100.50','currency':'USD'}
    first=c.post(API+'/workspace/quotas',json=quota);assert first.status_code in (200,409),first.text
    duplicate=c.post(API+'/workspace/quotas',json=quota);assert duplicate.status_code==409,duplicate.text


@pytest.mark.parametrize('email,role', [('sales.manager@doxa.local','sales_manager'),('marketing.manager@doxa.local','marketing_manager'),('marketing.rep@doxa.local','marketing_rep'),('success@doxa.local','customer_success')])
def test_other_roles_can_sign_in_and_use_assignment_directory(email,role):
    with httpx.Client(timeout=60,headers={'Origin':WEB}) as client:
        login=sign_in(client,email);assert login.status_code==200,login.text
        token=client.get(WEB+'/api/auth/token').json()['token']
        client.headers['Authorization']='Bearer '+token
        me=client.get(API+'/users/me');assert me.status_code==200,me.text
        assert me.json()['role']==role
        directory=client.get(API+'/users/directory');assert directory.status_code==200,directory.text
        assert all('email' not in user for user in directory.json())


def test_report_readable_relations_and_invalid_filters(clients):
    c=clients['admin']
    response=c.post(API+'/reports/custom',json={'entity':'deals','fields':['id','owner_name','account_name']})
    assert response.status_code==200,response.text
    assert response.json()['rows']
    assert all(isinstance(row[1],str) and row[1] for row in response.json()['rows'])
    invalid=c.post(API+'/reports/custom',json={'entity':'leads','fields':['id'],'filters':[{'field':'assigned_to','operator':'eq','value':'invalid-uuid'}]})
    assert invalid.status_code==422,invalid.text
