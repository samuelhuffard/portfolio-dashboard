"""
Run with: mitmdump -s scripts/capture-robinhood-token.py --port 8080

This script watches for any request to agent.robinhood.com and prints the
Authorization header so you can copy the bearer token.
"""
from mitmproxy import http
import datetime

def request(flow: http.HTTPFlow):
    host = flow.request.pretty_host
    if "robinhood.com" not in host:
        return

    auth = flow.request.headers.get("authorization", "")
    ts = datetime.datetime.now().strftime("%H:%M:%S")

    print(f"\n[{ts}] 📡  {flow.request.method} https://{host}{flow.request.path}")

    if auth:
        print(f"\n{'='*60}")
        print(f"🎯  ROBINHOOD TOKEN CAPTURED")
        print(f"{'='*60}")
        print(f"{auth}")
        print(f"{'='*60}\n")
        print("Copy the token above (everything after 'Bearer ') and run:")
        print("  curl -X POST https://portfolio-dashboard-ivory-five.vercel.app/api/robinhood/seed-token \\")
        print("    -H 'Content-Type: application/json' \\")
        print(f"    -H 'Authorization: <your-dashboard-api-key>' \\")
        print("    -d '{\"token\": \"<paste-token-here>\"}'")
        print()
    else:
        print(f"  (no Authorization header on this request)")
