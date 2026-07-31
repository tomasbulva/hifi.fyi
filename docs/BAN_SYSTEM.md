# Ban System Documentation

This document describes the IP-based fail-to-ban system implemented in the `hifi` web player.

## Overview

The `hifi` player implements a server-side "fail-to-ban" system to protect against brute-force login attempts and other malicious activities. It tracks failed login attempts by IP address and, after a certain number of failures, temporarily or permanently bans the IP from accessing the application. The system is persistent across server restarts, as ban data is stored in an SQLite database.

## How It Works

1.  **IP-Based Tracking**: The system tracks failed login attempts based on the client's IP address.
2.  **Escalating Bans**: The ban duration escalates with the number of failed attempts:
    *   **5 failed attempts**: 30-second ban
    *   **10 failed attempts**: 60-second ban
    *   **15 failed attempts**: 24-hour ban
    *   **20+ failed attempts**: Permanent ban (auto-generated)
3.  **Persistence**: All ban data (IP, attempts, ban expiry, last attempt, and manual ban status) is stored in an SQLite `bans` table. This means bans persist even if the server restarts.
4.  **Middleware Protection**: An Express middleware intercepts all incoming requests. If an IP is banned, requests from that IP are blocked:
    *   **Permanent Ban**: Returns `HTTP 403 Forbidden` with a `permanent: true` flag.
    *   **Temporary Ban**: Returns `HTTP 429 Too Many Requests` with a `retryAfter` value (seconds remaining until the ban expires).
5.  **Client-Side Interaction**: The `Login.tsx` component on the frontend handles interaction with the ban system:
    *   On page load, it queries the server (`GET /api/auth/ban-status`) to check the current IP's ban status.
    *   If temporarily banned, it polls the server every second to display a live countdown.
    *   Login errors trigger a `POST /api/auth/failed` call to the server to record the failed attempt.
    *   Successful logins trigger a `POST /api/auth/success` call to clear the attempt counter for that IP.
    *   The UI dynamically updates to show ban messages (countdown or permanent ban notice).

## Admin API Endpoints

These endpoints are part of the `hifi` server and are protected by `authMiddleware` (require authentication, typically an API key).

### 1. Get Ban List

`GET /api/bans`
Returns a list of all currently banned IPs and their details, including attempts, `banned_until` timestamp, last attempt time, and whether it's a `manual` ban.

```json
[
  {
    "ip": "192.168.1.100",
    "attempts": 25,
    "banned_until": null,
    "last_attempt": 1678886400000,
    "manual": 0
  },
  {
    "ip": "203.0.113.5",
    "attempts": 0,
    "banned_until": null,
    "last_attempt": 1678886400000,
    "manual": 1
  }
]
```

### 2. Manually Ban an IP

`POST /api/bans`
Allows an administrator to manually and permanently ban an IP address.

*   **Request Body**: `{"ip": "IP_ADDRESS"}`
*   **Protection**: Requires `authMiddleware`.
*   **Behavior**: A manually added ban is permanent (`banned_until` is `NULL`) and `manual` is set to `1`. These bans are not cleared by `DELETE /api/bans` (which only affects auto-generated bans).

Example using `curl`:
```bash
curl -X POST -H "Content-Type: application/json" -H "x-api-key: YOUR_API_KEY" \
     -d '{"ip": "192.168.1.100"}' http://localhost:4321/api/bans
```

### 3. Unban a Specific IP

`DELETE /api/bans/:ip`
Removes a ban (either auto-generated or manual) for a specific IP address.

*   **URL Parameter**: `:ip` should be the IP address to unban.
*   **Protection**: Requires `authMiddleware`.

Example using `curl`:
```bash
curl -X DELETE -H "x-api-key: YOUR_API_KEY" \
     http://localhost:4321/api/bans/192.168.1.100
```

### 4. Clear All Auto-Generated Bans

`DELETE /api/bans`
Removes all temporary and auto-generated permanent bans that resulted from failed login attempts. **Manually added permanent bans (`manual: 1`) are NOT affected by this endpoint.**

*   **Protection**: Requires `authMiddleware`.

Example using `curl`:
```bash
curl -X DELETE -H "x-api-key: YOUR_API_KEY" \
     http://localhost:4321/api/bans
```

## Limitations

*   **No Pre-emptive Auto-Bans**: The system only starts tracking an IP after its first failed login attempt. There is no automatic mechanism to ban an IP *before* any login failures (though manual banning can be used for this).
*   **No Centralized Blacklist UI**: The admin endpoints are API-only. There is no graphical user interface within the `hifi` player to manage the IP blacklist.
