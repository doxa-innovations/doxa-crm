#!/usr/bin/env python3
"""Run on the platform host; preserve existing values, never print credentials."""
import json,subprocess,base64,urllib.request,urllib.parse,urllib.error
raw=json.loads(subprocess.check_output(['sudo','-n','k3s','kubectl','-n','infisical-operator-system','get','secret','doxa-infisical-runtime-auth','-o','json']))['data']
def api(path,data=None,method=None):
 req=urllib.request.Request('https://app.infisical.com'+path,data=json.dumps(data).encode() if data else None,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if 'token' in globals() else {})})
 try:
  with urllib.request.urlopen(req,timeout=25) as r:return json.load(r)
 except urllib.error.HTTPError as e:
  print('API failure',e.code,path.split('?')[0]);raise SystemExit(1)
token=api('/api/v1/auth/universal-auth/login',{k:base64.b64decode(raw[k]).decode() for k in ('clientId','clientSecret')})['accessToken']
project='6d95ee86-269c-4719-b2c8-c834753610d8'
import secrets
folders=api('/api/v1/folders?'+urllib.parse.urlencode({'workspaceId':project,'environment':'prod','path':'/'}))
if 'crm' not in [f['name'] for f in folders.get('folders',[])]:
 api('/api/v1/folders',{'workspaceId':project,'environment':'prod','name':'crm','path':'/'})
 print('Created prod:/crm')
params={'workspaceId':project,'environment':'prod','secretPath':'/crm','expandSecretReferences':'false'}
existing=api('/api/v3/secrets/raw?'+urllib.parse.urlencode(params))
values={s['secretKey']:s['secretValue'] for s in existing.get('secrets',[])}
password=values.get('POSTGRES_PASSWORD') or secrets.token_hex(32)
shared=values.get('SECRET_KEY') or values.get('BETTER_AUTH_SECRET') or secrets.token_hex(32)
defaults={
 'POSTGRES_USER':'doxa_crm','POSTGRES_DB':'doxa_crm','POSTGRES_PASSWORD':password,
 'DATABASE_URL':'postgresql://doxa_crm:'+password+'@doxa-crm-postgresql:5432/doxa_crm',
 'REDIS_URL':'redis://doxa-crm-redis:6379/0',
 'SECRET_KEY':shared,'BETTER_AUTH_SECRET':shared,'WEBHOOK_SECRET':secrets.token_hex(32),
 'ENVIRONMENT':'production','NODE_ENV':'production','CORS_ORIGINS':'https://crm.doxaplc.com',
 'BETTER_AUTH_URL':'https://crm.doxaplc.com','API_INTERNAL_URL':'http://doxa-crm-api',
 'MEILISEARCH_URL':'http://doxa-crm-meilisearch:7700','MEILISEARCH_API_KEY':secrets.token_hex(32),
 'GOOGLE_CLIENT_ID':'${prod.forms.GOOGLE_CLIENT_ID}',
 'GOOGLE_CLIENT_SECRET':'${prod.forms.GOOGLE_CLIENT_SECRET}',
 'CRM_SSO_ADMIN_EMAILS':'doxainnovationsplc@gmail.com',
 'ADMIN_EMAIL':'dev@doxaplc.com','ADMIN_FULL_NAME':'Doxa Administrator','ADMIN_PASSWORD':secrets.token_urlsafe(32),
 'DB_POOL_SIZE':'5','DB_MAX_OVERFLOW':'5','BETTER_AUTH_DB_POOL_MAX':'5','LOG_LEVEL':'INFO',
 'CELERY_WORKER_CONCURRENCY':'2',
}
for key,value in defaults.items():
 if key in values:
  print('Preserved',key);continue
 api('/api/v3/secrets/raw/'+key,{**{k:v for k,v in params.items() if k!='expandSecretReferences'},'type':'shared','secretValue':value})
 print('Created',key)
resolved=api('/api/v3/secrets/raw?'+urllib.parse.urlencode({**params,'expandSecretReferences':'true'}))
resolved={s['secretKey']:s['secretValue'] for s in resolved.get('secrets',[])}
assert all(resolved.get(k) and not resolved[k].startswith('${') for k in defaults), 'Missing values or unresolved references'
assert resolved['SECRET_KEY']==resolved['BETTER_AUTH_SECRET'], 'JWT secrets must match'
u=urllib.parse.urlparse(resolved['DATABASE_URL'])
assert u.hostname=='doxa-crm-postgresql' and u.path=='/doxa_crm', 'Unexpected database target; inspect before deployment'
assert u.password==resolved['POSTGRES_PASSWORD'] and u.username==resolved['POSTGRES_USER'], 'Database credentials mismatch'
print('CRM settings verified. No secret values printed.')
