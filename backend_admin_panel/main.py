import os
import time
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

FACE_API_URL = os.getenv("FACE_API_URL")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")

if not FACE_API_URL or not ADMIN_API_KEY:
    raise RuntimeError("Missing FACE_API_URL or ADMIN_API_KEY in environment variables.")

# Track server start time for uptime calculation
START_TIME = time.time()

# In-memory activity log store
ACTIVITY_LOGS = [
    {
        "id": 1,
        "name": "System Startup",
        "time": datetime.now().strftime("%I:%M %p"),
        "type": "SYS",
        "confidence": 100,
        "result": "ONLINE"
    }
]

http_client = httpx.AsyncClient(base_url=FACE_API_URL, timeout=30.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await http_client.aclose()

app = FastAPI(title="Face Access Admin Proxy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500", 
        "http://127.0.0.1:5500",
        "http://localhost:5173", # Allows your local Vite frontend
        "https://curly-admin-panel-six.vercel.app"
        "*" # wildcard for easy testing
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    try:
        response = await http_client.get("/health")
        backend_status = "ONLINE" if response.status_code == 200 else "DEGRADED"
    except httpx.RequestError:
        backend_status = "OFFLINE"

    return {
        "proxy": "ONLINE",
        "backend": backend_status
    }

# --- LOCAL INTERCEPTED ROUTES ---

@app.get("/admin/stats")
async def get_dashboard_stats():
    """Calculates live stats from existing endpoints without modifying Cloud Run."""
    uptime_seconds = int(time.time() - START_TIME)
    hours, remainder = divmod(uptime_seconds, 3600)
    minutes, _ = divmod(remainder, 60)
    uptime_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

    total_personnel = 0
    active_personnel = 0

    try:
        # Query existing /admin/people endpoint to derive stats
        res = await http_client.get("/admin/people", headers={"X-Admin-Key": ADMIN_API_KEY})
        if res.status_code == 200:
            data = res.json()
            records = data if isinstance(data, list) else data.get("people", [])
            total_personnel = len(records)
            active_personnel = sum(1 for p in records if p.get("authorized", True))
    except Exception:
        pass

    return {
        "today_entries": total_personnel,
        "active_personnel": active_personnel,
        "uptime": uptime_str
    }

@app.get("/admin/logs")
async def get_activity_logs():
    """Returns local admin activity logs."""
    return {"logs": ACTIVITY_LOGS[:10]}

# --- TRANSPARENT PROXY ROUTE ---

@app.api_route("/admin/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admin_routes(path: str, request: Request):
    url = f"/admin/{path}"
    headers = {"X-Admin-Key": ADMIN_API_KEY}
    
    content_type = request.headers.get("content-type")
    if content_type:
        headers["Content-Type"] = content_type
        
    body = await request.body()
    
    try:
        response = await http_client.request(
            request.method, 
            url, 
            headers=headers, 
            content=body
        )

        # Log admin mutations locally
        if response.status_code in [200, 201]:
            action_map = {"POST": "Added Personnel", "PUT": "Updated Record", "DELETE": "Removed Personnel"}
            if request.method in action_map:
                ACTIVITY_LOGS.insert(0, {
                    "id": len(ACTIVITY_LOGS) + 1,
                    "name": action_map[request.method],
                    "time": datetime.now().strftime("%I:%M %p"),
                    "type": request.method,
                    "confidence": 100,
                    "result": "SUCCESS"
                })

        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type=response.headers.get("content-type", "application/json")
        )

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Face Access API unavailable: {str(e)}")