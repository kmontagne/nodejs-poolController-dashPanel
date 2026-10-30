# Deploy Commands for Raspberry Pi

Target Raspberry Pi:

```text
192.168.50.35
```

Replace `pi` with your actual SSH username if different.

## Normal Deployment

Use this when you want to run the published Docker images on the Raspberry Pi.

From this Mac:

```sh
scp /Users/kevin/pool-automation/deploy-rpi/docker-compose.yml pi@192.168.50.35:~/pool-automation/docker-compose.yml
```

On the Raspberry Pi:

```sh
ssh pi@192.168.50.35
mkdir -p ~/pool-automation
cd ~/pool-automation
touch server-config.json dash-config.json
docker compose pull
docker compose up -d
docker compose ps
```

Open the dashboard:

```text
http://192.168.50.35:5150
```

Backend API:

```text
http://192.168.50.35:4200
```

## Check RS485 Adapter

Run this on the Raspberry Pi:

```sh
ls /dev/ttyACM* /dev/ttyUSB*
```

If the adapter is `/dev/ttyUSB0`, edit `docker-compose.yml` on the Pi:

```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
```

If the adapter is `/dev/ttyACM0`, keep:

```yaml
devices:
  - /dev/ttyACM0:/dev/ttyUSB0
```

Then restart:

```sh
cd ~/pool-automation
docker compose up -d
```

## Logs

On the Raspberry Pi:

```sh
cd ~/pool-automation
docker compose logs -f njspc
```

Dashboard logs:

```sh
cd ~/pool-automation
docker compose logs -f njspc-dash
```

## Stop or Restart

Restart:

```sh
cd ~/pool-automation
docker compose restart
```

Stop:

```sh
cd ~/pool-automation
docker compose down
```

## Source Build Deployment

Use this after changing code and wanting to build custom Docker images on the Raspberry Pi.

From this Mac:

```sh
rsync -av --delete /Users/kevin/pool-automation/nodejs-poolController/ pi@192.168.50.35:~/src/nodejs-poolController/
rsync -av --delete /Users/kevin/pool-automation/nodejs-poolController-dashPanel/ pi@192.168.50.35:~/src/nodejs-poolController-dashPanel/
```

On the Raspberry Pi, build the backend:

```sh
ssh pi@192.168.50.35
cd ~/src/nodejs-poolController
docker build -t njspc:local .
```

Build the dashboard:

```sh
cd ~/src/nodejs-poolController-dashPanel
docker build -t njspc-dash:local .
```

Then edit `~/pool-automation/docker-compose.yml` on the Pi to use:

```yaml
image: njspc:local
```

and:

```yaml
image: njspc-dash:local
```

Restart:

```sh
cd ~/pool-automation
docker compose up -d
docker compose ps
```

## Codex Dev Deployment

Use this after changing code on the Mac when you want to avoid building on the Raspberry Pi.

From this Mac:

```sh
PI_HOST=192.168.50.35 /Users/kevin/pool-automation/deploy-rpi/deploy-codex.sh
```

This builds `linux/arm64` images on the Mac, copies them to the Raspberry Pi, loads them into Docker, installs `docker-compose.codex.yml` as `~/pool-automation/docker-compose.yml`, and restarts the containers.

The Pi will run:

```yaml
image: njspc:codex
image: njspc-dash:codex
```

with no `build:` entries.

Pass `PI_HOST` explicitly: the script's built-in default still points to the previous
address, `192.168.50.33`. The current Pi is `192.168.50.35`.

## Chlorinator Usage Deployment and Verification

Usage tracking requires the updated controller image; the Chemistry readout and
**Set cell usage** editor require the updated dashboard image. Deploy both for the
complete feature. The controller stores totals and observation checkpoints in
`/app/data/poolState.json`, backed by the `njspc-data` named volume. Keep that volume
when recreating containers to retain the accumulated usage.

Before loading replacement images, you can preserve the running images and a
state snapshot on the Pi:

```sh
cd ~/pool-automation
docker tag njspc:codex njspc:rollback
docker tag njspc-dash:codex njspc-dash:rollback
docker exec njspc sh -c 'mkdir -p /app/backups/before-usage-update; cp /app/data/poolState.json /app/backups/before-usage-update/poolState.json'
```

After deployment, check both services and the usage data:

```sh
ssh pi@192.168.50.35
cd ~/pool-automation
docker compose ps
docker inspect --format='{{.Name}} {{.State.Health.Status}}' njspc njspc-dash
curl -fsS http://127.0.0.1:4200/state/chlorinator/1
```

Use the configured chlorinator ID if it is not 1. The API should include
`usageHours`; after output observations begin, it also includes `usageLastOutput`
and `usageLastSampleAt` (epoch milliseconds). Verify the display at
`http://192.168.50.35:5150`:

1. Reload the browser page after deployment.
2. Confirm **Usage 0.00 hours** (with the current total) starts directly below
   **Salt**, uses the same font, and has a space before **hours**.
3. Open chlorinator settings and select **Set cell usage**. Confirm the hours edit
   box opens with **0**, then use **Cancel** to leave the live total unchanged.
4. When intentionally adjusting the total, enter non-negative hours and select
   **Save**. Fractional values are accepted. Reopening the editor starts at 0 again.

The edit API is `PUT /state/chlorinator/resetUsage` with a JSON body such as
`{ "id": 1, "usageHours": 125.5 }`. Negative or nonnumeric values return HTTP 400;
an unknown chlorinator returns HTTP 404. Omitting `usageHours` resets to zero for
compatibility. Saving replaces the total and restarts accounting from that moment.

For a dashboard-only update, recreate only that service after loading its image:

```sh
docker compose up -d --no-deps --force-recreate njspc-dash
```

App pages and theme stylesheets now use `Cache-Control: no-cache`, allowing stored
assets to be revalidated on reload. App scripts use `no-store`. The widget
stylesheet also has a versioned URL. Verify visual changes in the browser; serving
the updated files alone does not establish that their rendered layout is correct.
