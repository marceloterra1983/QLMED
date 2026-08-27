#!/usr/bin/env bash
# qlmed-n8n-stuck-watchdog.sh — detecta execuções "running" longas no qlmed-n8n.
# Adaptado do watchdog AutomatizeMS (charlie); aponta para N8N_BASE_URL do QLMED.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="${WATCHDOG_CONFIG:-$root/config/n8n-stuck-thresholds.json}"
state_dir="${STATE_DIRECTORY:?STATE_DIRECTORY is required}"
now="${NOW_EPOCH:-$(date +%s)}"
mkdir -p -m 0700 "$state_dir"
exec 9>"$state_dir/watchdog.lock"
flock -n 9 || exit 0

emit_api_error() {
  printf '{"event":"watchdog_error","at":%s}\n' "$now" >>"$state_dir/outbox.jsonl"
  exit 1
}
if [[ -n "${WATCHDOG_FIXTURE:-}" ]]; then
  [[ "${WATCHDOG_FIXTURE_STATUS:-200}" == 200 ]] || emit_api_error
  response="$(<"$WATCHDOG_FIXTURE")"
else
  : "${N8N_BASE_URL:?N8N_BASE_URL is required}"
  : "${N8N_API_KEY_FILE:?N8N_API_KEY_FILE is required}"
  key_mode="$(stat -c %a "$N8N_API_KEY_FILE")"
  [[ "$key_mode" == 400 || "$key_mode" == 440 || "$key_mode" == 600 ]] || { echo "API key file permissions are unsafe" >&2; exit 2; }
  api_key="$(python3 - "$N8N_API_KEY_FILE" <<'PY'
import sys
lines=[x.strip() for x in open(sys.argv[1]) if x.strip() and not x.lstrip().startswith('#')]
values=dict(x.split('=',1) for x in lines if '=' in x)
v=values.get('N8N_API_KEY', lines[0] if len(lines)==1 and '=' not in lines[0] else '')
print(v.strip().strip('"').strip("'"),end='')
PY
)"
  [[ -n "$api_key" ]] || { echo "N8N_API_KEY missing from key file" >&2; exit 2; }
  response="$(printf 'header = "X-N8N-API-KEY: %s"\n' "$api_key" | curl --config - \
    --fail --silent --show-error --request GET \
    "${N8N_BASE_URL%/}/api/v1/executions?status=running&limit=100")" || emit_api_error
fi

RESPONSE="$response" CONFIG="$config" STATE="$state_dir/state.json" OUTBOX="$state_dir/outbox.jsonl" NOW="$now" \
python3 - <<'PY'
import datetime, json, os, pathlib
now=int(os.environ['NOW']); cfg=json.load(open(os.environ['CONFIG']))
payload=json.loads(os.environ['RESPONSE']); items=payload.get('data', payload if isinstance(payload,list) else [])
sp=pathlib.Path(os.environ['STATE']); out=pathlib.Path(os.environ['OUTBOX'])
try: state=json.load(open(sp))
except (FileNotFoundError,json.JSONDecodeError): state={}
seen=set(); events=[]
for x in items:
    eid=str(x.get('id')); wid=str(x.get('workflowId','unknown')); seen.add(eid)
    started=x.get('startedAtEpoch')
    if started is None and x.get('startedAt'):
        try: started=int(datetime.datetime.fromisoformat(x['startedAt'].replace('Z','+00:00')).timestamp())
        except ValueError: continue
    if started is None: continue
    limit=int(cfg.get('workflows',{}).get(wid,cfg.get('defaultSeconds',300)))
    if now-int(started) <= limit: continue
    s=state.setdefault(eid,{'workflowId':wid,'observations':0,'open':False,'lastAlert':0})
    s['observations']+=1
    if s['observations']>=2 and not s['open']:
        events.append({'event':'stuck','executionId':eid,'workflowId':wid,'at':now}); s['open']=True; s['lastAlert']=now
    elif s['open'] and now-s['lastAlert']>=int(cfg.get('repeatSeconds',1800)):
        events.append({'event':'escalation','executionId':eid,'workflowId':wid,'at':now}); s['lastAlert']=now
for eid,s in list(state.items()):
    if eid not in seen:
        if s.get('open'): events.append({'event':'recovery','executionId':eid,'workflowId':s['workflowId'],'at':now})
        del state[eid]
tmp=sp.with_suffix('.tmp'); tmp.write_text(json.dumps(state,sort_keys=True)); os.chmod(tmp,0o600); tmp.replace(sp)
with out.open('a') as f:
    for e in events: f.write(json.dumps(e,sort_keys=True)+'\n')
PY

if [[ -n "${ALERT_WEBHOOK_FILE:-}" && -s "$state_dir/outbox.jsonl" ]]; then
  "$ALERT_WEBHOOK_FILE" "$state_dir/outbox.jsonl"
fi
