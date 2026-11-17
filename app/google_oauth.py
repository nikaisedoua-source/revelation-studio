"""Local Google account linking: PKCE, expiring one-use state, pinned subject."""
import base64,hashlib,json,secrets,threading,time,urllib.parse,urllib.request
from . import providers
STATES={};LOCK=threading.RLock()

def client():
 v=providers.values('google_auth')
 return v.get('GOOGLE_CLIENT_ID',''),v.get('GOOGLE_CLIENT_SECRET','')

def begin(redirect_uri,link_token=None):
 client_id,secret=client()
 if not client_id or not secret:raise ValueError('Configurer le client OAuth Google dans IA & quotas et enregistrer cette URI de retour : '+redirect_uri)
 state=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
 with LOCK:
  for k in list(STATES):
   if STATES[k]['expires']<time.time():STATES.pop(k,None)
  STATES[state]={'expires':time.time()+300,'verifier':verifier,'redirect_uri':redirect_uri,'link_token':link_token}
 query=urllib.parse.urlencode({'client_id':client_id,'redirect_uri':redirect_uri,'response_type':'code','scope':'openid email','state':state,'code_challenge':challenge,'code_challenge_method':'S256','prompt':'select_account'})
 return 'https://accounts.google.com/o/oauth2/v2/auth?'+query

def finish(state,code):
 with LOCK:entry=STATES.pop(state,None)
 if not entry or entry['expires']<time.time():raise ValueError('Autorisation Google expirée ou déjà utilisée. Recommencer depuis le Studio.')
 client_id,secret=client();body=urllib.parse.urlencode({'client_id':client_id,'client_secret':secret,'redirect_uri':entry['redirect_uri'],'code':code,'code_verifier':entry['verifier'],'grant_type':'authorization_code'}).encode()
 try:
  from .cloud_client import NoRedirect
  opener=urllib.request.build_opener(NoRedirect())
  with opener.open(urllib.request.Request('https://oauth2.googleapis.com/token',body,{'Content-Type':'application/x-www-form-urlencoded'}),timeout=30) as r:token=json.load(r)
  access=token.get('access_token')
  if not access:raise ValueError('Google n’a pas retourné de jeton d’accès.')
  with opener.open(urllib.request.Request('https://openidconnect.googleapis.com/v1/userinfo',headers={'Authorization':'Bearer '+access}),timeout=30) as r:identity=json.load(r)
 except (OSError,ValueError):raise ValueError('Google n’a pas validé cette autorisation. Vérifier le client OAuth et son URI de retour.') from None
 if not identity.get('sub') or identity.get('email_verified') is not True:raise ValueError('Le compte Google doit disposer d’une adresse vérifiée.')
 return identity,entry
