# nodejs-poolController-dashPanel
## What is nodejs-poolController-dashPanel?
dashPanel is a controller designed to operate using a [nodejs-poolController](https://github.com/tagyoureit/nodejs-poolController) server backend.  You will need to set up your nodejs-poolController server and have it communicating with your pool equipment prior to setting up this server.  Once you have done that you can set up the dashPanel to communicate with that server.

This fork uses semver prerelease versions such as `9.1.0-km.4` to distinguish Kevin Montagne builds from upstream dashPanel releases. Noteworthy fork-specific behavior is documented here as it is added, and release notes are tracked in [CHANGELOG.md](CHANGELOG.md).

While this project was originally developed using an IntelliCenter control panel it should operate equally well with an IntelliTouch or EasyTouch control panel.
![image](https://user-images.githubusercontent.com/47839015/83304160-38a86780-a1b3-11ea-8214-442db6c6bdc4.png)

## Configuring the dashPanel
To configure the dashPanel you need to place the url for your [nodejs-poolController](https://github.com/tagyoureit/nodejs-poolController) server in the configuration.  Click the bars menu on the top left of the screen and fill in the ip address and port.  Then press the Apply button.  If this button is grayed out you will need to edit the config.json file manually and enter the settings under the services menu.

## Automations
The **Automations** panel edits the nodejs-poolController rules engine configuration stored on the backend under `web.rules`. Use it to create rule groups, add rules, define conditions, and choose actions.

The panel appears in a dedicated automation/charting row below the original dashboard columns, followed by Rule Log and Temperature History. When collapsed, it shrinks to its title row instead of leaving a large empty panel.

The top of the panel also includes temperature-source display controls:

* **Show solar source** controls whether the backend solar temperature source is exposed to Automations and Temperature History.
* **Solar label** changes the user-facing label. Use this when the controller's solar input is wired to another source, for example `Glacier`.

The underlying backend field remains `solar` for compatibility, even when the visible label is changed.

### Rule groups and active windows
Each group can have an optional **Active Window**. Leave it disabled for rules that should run all the time.

When **Use active window** is enabled, you can restrict the group by:

* Start date and end date in `MM-DD` format.
* Start time and end time.
* Days of the week.

Blank fields mean unrestricted. For example, setting only Monday through Friday limits the group to weekdays at all times. Setting `05-01` through `10-15` limits it to that seasonal date range. The backend also supports date ranges that cross the end of the year and time ranges that cross midnight.

When a group is outside its active window, its rules do not evaluate and `Otherwise` actions do not run. Existing equipment state is left alone.

### Conditions and actions
Rules are evaluated from top-level pool state such as temperatures, circuit state, feature state, heater state, and schedule state. Temperature conditions include pool, spa, air, solar/glacier, selected body, and dew point.

Actions can set circuits or features, lock circuits/features, disable schedules, or write a log message. `Then` actions run when the rule is true. `Otherwise` actions run when the rule is false, subject to the rule's hysteresis settings.

### Hysteresis
Use hysteresis when a rule should remain true or false for a period before actions run. This is useful for temperature-based automation where readings can bounce around a threshold. While hysteresis is pending, the rule status line shows the remaining wait time before `Then` or `Otherwise` actions run.

## Rule Log
The **Rule Log** panel shows recent rule action events from the backend `/config/rules/log` API. It is collapsed by default, appears between Automations and Temperature History in the dedicated automation/charting row, and only loads entries when expanded.

The default view shows one summary row for each rule action event, including the time, Then/Otherwise branch, rule group, rule name, and evaluation reason. Use **Show action details** to include the individual action results that were persisted with the event.

## Temperature History
The **Temperature History** panel plots recent temperature samples from the backend `/state/tempHistory` API. It can show pool, spa, solar/glacier, air, and dew point series.

Use the series toggles to choose which values are plotted. Dew Point is available when the backend has a pool location configured and can fetch weather data. The solar-source series uses the label configured in Automations and is hidden when **Show solar source** is off.

The panel appears below Rule Log in the dedicated automation/charting row. When collapsed, it shrinks to its title row.

Below the series toggles, the panel shows `Avg / Min / Max:` for each enabled visible curve over the selected date/time range. Values are listed in the same order as the series toggles.

Move the mouse over the chart area to show a vertical guide line and the values for the nearest sample. The values are displayed above the chart status line and sorted from highest to lowest value for easier comparison.

## What is Message Manager?
Message manager allows you to inspect your RS485 communication coming from and going to the [nodejs-poolController](https://github.com/tagyoureit/nodejs-poolController) server.  This tool decodes the messages and displays them in a manner where important chatter on the RS485 connection can be decoded while eliminating the chatter that don't matter.  Special filters can be applied to reduce the information to only the items you are interested in.
![image](https://user-images.githubusercontent.com/47839015/83314254-7a92d700-a1ce-11ea-8891-545db084624e.png)

## Quick Start (docker-compose)
Below is a minimal example running both the backend `nodejs-poolController` (service name `njspc`) and this dashPanel UI (service name `njspc-dash`). Adjust volumes and device mappings as needed. The dashPanel writes its configuration to `/app/config.json`, so we bind mount a host file to persist it. Additional runtime state (queues/uploads/logs) uses named volumes.

```yaml
services:
   njspc:
      image: ghcr.io/tagyoureit/njspc
      container_name: njspc
      restart: unless-stopped
      environment:
         - TZ=${TZ:-UTC}
         - NODE_ENV=production
         # Serial vs network connection options
         # - POOL_NET_CONNECT=true
         # - POOL_NET_HOST=raspberrypi
         # - POOL_NET_PORT=9801
         # Provide coordinates so sunrise/sunset (heliotrope) works immediately - change as needed
         - POOL_LATITUDE=28.5383
         - POOL_LONGITUDE=-81.3792
      ports:
         - "4200:4200"
      devices:
         - /dev/ttyACM0:/dev/ttyUSB0
      # Persistence (create host directories/files first)
      volumes:
         - ./server-config.json:/app/config.json   # Persisted config file on host
         - njspc-data:/app/data                    # State & equipment snapshots
         - njspc-backups:/app/backups              # Backup archives
         - njspc-logs:/app/logs                    # Logs
         - njspc-bindings:/app/web/bindings/custom # Custom bindings
      # OPTIONAL: If you get permission errors accessing /dev/tty*, prefer adding the container user to the host dialout/uucp group;
      # only as a last resort temporarily uncomment the two lines below to run privileged/root (less secure).
      # privileged: true
      # user: "0:0"

   njspc-dash:
     image: ghcr.io/rstrouse/njspc-dash
     container_name: njspc-dash
     restart: unless-stopped
     depends_on:
       - njspc
     environment:
       - TZ=${TZ:-UTC}
       - NODE_ENV=production
       - POOL_WEB_SERVICES_IP=njspc      # Link to backend service name
     ports:
       - "5150:5150"
     volumes:
       - ./dash-config.json:/app/config.json
       - njspc-dash-data:/app/data
       - njspc-dash-logs:/app/logs
       - njspc-dash-uploads:/app/uploads

volumes:
  njspc-data:
  njspc-backups:
  njspc-logs:
  njspc-bindings:
  njspc-dash-data:
  njspc-dash-logs:
  njspc-dash-uploads:
```

After starting, browse to: `http://localhost:5150` and configure any remaining settings via the UI. The dashPanel will connect automatically to `njspc:4200` unless overridden.

## Persistence & Configuration
The application loads configuration from `/app/config.json` at startup and rewrites it atomically after changes (writes to a temporary file then renames). To persist across container recreations:

1. Create a host directory and seed the file (optional – if omitted, an empty file will be populated after first change):
  ```bash
  mkdir -p config
  docker run --rm ghcr.io/rstrouse/njspc-dash cat /app/config.json > config/config.json
  ```
2. Use the bind mount shown in the compose example: `./config/config.json:/app/config.json`.
3. If the mounted file is empty, defaults + environment overrides are applied and the file will be written once you change settings via the UI/API.

If a write is interrupted, the app can recover from a `.tmp` file; if corruption is detected the previous file is backed up as `config.json.corrupt` (when non-empty) and defaults are re-applied.

Environment variable overrides (new hierarchical form) include:
* `POOL_WEB_SERVICES_IP`
* `POOL_WEB_SERVICES_PORT`
* `POOL_WEB_SERVICES_PROTOCOL`
* `POOL_WEB_SERVERS_HTTP_PORT`, `POOL_WEB_SERVERS_HTTPS_PORT`
* `POOL_WEB_SERVERS_HTTP_ENABLED`, `POOL_WEB_SERVERS_HTTPS_ENABLED`

Legacy variables `POOL_HTTP_IP` and `POOL_HTTP_PORT` are still honored.

For production hardenings consider: enabling HTTPS, adding reverse proxy headers, mounting persistent volumes, and restricting exposed ports. Ensure ownership of the mounted `config.json` permits writes by the container user (UID 1000 in the official image); otherwise configuration changes will be disabled.

## Remote access
As configured in Quick Start above, the dashboard is only suitable to be used on your local network.  To secure the website for accessing remotely on the internet you will need to use a [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy) that is configured to use encryption and authentication.  There are several reverse proxies available, including [Nginx](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/) and [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy).  An example setup with [YARP](https://dotnet.github.io/yarp/) is documented in the wiki under [Secure remote access](https://github.com/rstrouse/nodejs-poolController-dashPanel/wiki/Secure-remote-access).
