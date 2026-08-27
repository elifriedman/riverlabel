# RiverLabel

RiverLabel is a small tool for managing a river-profile labeling project in [Label Studio](https://labelstud.io/). Labelers use Label Studio to mark parts of elevation profiles. Administrators use RiverLabel's web page to manage labelers and decide which tasks each person receives.

Each task displays an elevation profile, the neighbouring profiles, and a map. Labelers mark sections of the profile as:

- `סוללה` — embankment
- `אפיק טבעי` — natural channel
- `אפיק מוסדר` — regulated channel

RiverLabel does not create or import the source data. The tasks must already be present in Label Studio's main project.

## Overview

The project runs two web applications on the same machine. Labelers work directly in Label Studio, which normally runs on port 8080. Administrators use the RiverLabel admin page, which normally runs on port 8001. The admin page connects to Label Studio to read and update users, projects, and task assignments.

Label Studio stores the users, projects, tasks, and submitted labels. RiverLabel uses Label Studio's API to assign tasks to users and create their personal projects.

The main ideas are:

- There is one **base project**, which contains the full set of source tasks. Its ID is currently hard-coded as `34` in `src/api.py`.
- Every labeler has a separate Label Studio project named after their email address.
- A task object stores its labelers' email addresses in the `labelers` field, and whether it is a demonstration task in `is_demo` field.
- Demonstration tasks are sent to every active labeler and appear in a separate **Demo** view.

## What you need

- Linux, because the included server setup uses `systemd` and `sudo`.
- Python 3.11, Git, and internet access. The setup script refers specifically to Python 3.11.
- A Label Studio API token: a secret value that lets RiverLabel access Label Studio. You create one in Label Studio after its first start.
- Permission to install system services if the application will run continuously on a server.

## Installation

The supplied setup script creates a private Python installation named `venv`, installs a custom version of Label Studio, installs the other packages, and prepares Label Studio's web files:

```bash
./scripts/machine_setup.sh
```

The last part of that script also copies service files into `/etc/systemd/system/` and starts them with `sudo`. If you only want a local development installation, run the first four commands in `scripts/machine_setup.sh` manually and skip the `sudo` commands.

## Configuration

Create a `.env` file in the project root:

```dotenv
# Token created in Label Studio
LABEL_STUDIO=replace-with-your-label-studio-token

# Secret used to access RiverLabel's admin pages and actions
API_TOKEN=replace-with-a-long-password
```

`.env` is ignored by Git, so it will not be committed with the repository. Keep the file private nonetheless: anyone with these values can administer the system.

Open `html/admin.html` and update `"token"` with the same password you used in `API_TOKEN`:

```javascript
const headers = {"x-access-token": "token"}
```

This is a simple shared-secret arrangement, not a full login system.

The project currently assumes that its public address is `labelstudio.elifdev.com`. If you deploy it at a different address, update these places:

- `scripts/run_label_studio.sh`
- `scripts/update_dns_ip.sh`
- the project-link URLs in `src/api.py`

## Starting the application

Start Label Studio first:

```bash
./scripts/run_label_studio.sh
```

Open `http://localhost:8080`. On the first visit, create the Label Studio administrator account, then create an API token and add it to `.env` as `LABEL_STUDIO`.

In another terminal, start the RiverLabel admin application:

```bash
./scripts/admin_runner.sh
```

It listens on port 8001. Open the management page at:

```text
http://localhost:8001/admin?token=YOUR_API_TOKEN
```

Replace `YOUR_API_TOKEN` with the value from `.env`.

The public directory of active labelers is at `http://localhost:8001/taggers`.

## Using the admin page

1. Add labelers by email address and choose whether each one is active.
2. Save the user changes. This creates the Label Studio user and their personal project when needed.
3. Assign people to individual tasks, or click **Assign Tasks** to make a randomized, roughly even assignment among active people.
4. Click **Save Task Updates**. This is the step that actually copies tasks into labelers' projects.
5. Labelers open their personal Label Studio project and submit their work there.

The automatic assignment groups every three consecutive tasks with the same selected labelers. It prepares the assignments in the browser only; it does not save them until **Save Task Updates** is pressed.

### Demonstration tasks and views

Checking **Demo Task** means that task is assigned to all active labelers when assignments are saved. Every labeler project has two list views:

- **Default** shows ordinary tasks.
- **Demo** shows tasks marked as demonstrations.

### Resetting a round

**Reset Tasks** starts a process that continues in the background while the page remains open. It clears the assignments and demo flags on the base tasks, exports annotated tasks from every labeler project to `deleted_tasks/`, and then deletes the tasks from those projects.

This is an operational reset, not a harmless refresh. Create the `deleted_tasks/` directory first and back it up before using the button. The status appears on the admin page while the job runs.

## Task data expected by the labeling screen

The Label Studio configuration expects each task to include:

| Field | Purpose |
| --- | --- |
| `title` | A short task name shown above the chart. |
| `timeseriesUrl` | URL of the time-series JSON data. |
| `map` | Map content or link displayed with the task. |
| `distance_along_profile` | The time/distance column in the time-series data. |
| `elevation_prev` | Elevation data for the preceding profile. |
| `elevation` | Elevation data for the current profile. |
| `elevation_next` | Elevation data for the following profile. |

The exact screen layout and available labels are defined in `scripts/label_config.txt`.

## Admin HTTP routes

The admin page uses the following internal web addresses. They are mainly useful for maintenance or for another program that needs to work with RiverLabel. All routes below require the API token, either in the `x-access-token` header or as a `token` parameter, except `/taggers`.

| Route | What it does |
| --- | --- |
| `GET /admin` | Shows the admin page. |
| `GET /users` | Lists Label Studio users, their score, and active status. |
| `POST /updateUsers` | Creates or updates users and their projects. |
| `GET /tasks?project_id=34` | Lists tasks from the base project and their assignments. |
| `POST /updateTasks` | Saves selected task assignments and copies tasks to the relevant labeler projects; use `/taskUpdateStatus?id=…` to check progress. |
| `POST /resetTasks` | Clears the current assignments and removes tasks from labeler projects; use `/taskResetStatus?id=…` to check progress. |
| `POST /createViews` / `POST /deleteViews` | Creates or removes a Label Studio task-list view that shows one user's assigned tasks. |
| `GET` or `POST /signup` | Creates a labeler and their project. |
| `GET /taggers` | Shows the public active-labeler directory. |

## Running it as a server

The `services/` directory contains `systemd` service definitions. These are Linux configuration files that start the applications automatically and restart them after a reboot.

Before installing them, edit both files so their `User`, `WorkingDirectory`, and `ExecStart` values match your server and checkout location. They currently point to `/home/ubuntu/`.

There is also a path mismatch to fix: `services/label_studio.service` refers to `scripts/runner.sh`, while the current file is `scripts/run_label_studio.sh`.

After installing or editing a service definition, run:

```bash
sudo systemctl daemon-reload
sudo systemctl restart label_studio.service admin_api.service
sudo systemctl status label_studio.service admin_api.service
```

## Security and maintenance notes

- New users are currently given the password `abc123`. Change this in `src/backend.py` before using the project with real users.
- `/taggers` is public and exposes active labelers' email addresses and direct project links.
- The DNS script contains a password placeholder and passes it in a web request. Keep the real password outside the repository and restrict access to the script.
- `add_new_project_if_needed()` currently looks for `src/label_config.txt`, but the configuration file is stored at `scripts/label_config.txt`. That helper needs its path corrected before it can create a missing project on its own. The normal signup path already uses the correct file.
- There is no automated test suite in the repository. Test changes with a non-production user and task before changing a live assignment round.

## File guide

| Path | Role |
| --- | --- |
| `.gitignore` | Prevents local files such as `.env`, databases, logs, and virtual environments from being added to Git. |
| `requirements.txt` | Lists the Python packages used by RiverLabel. |
| `src/__init__.py` | Marks `src` as a Python package. |
| `src/api.py` | The Python web application: admin pages, signup, public directory, saving task assignments, resetting tasks, and progress checks. |
| `src/backend.py` | Helper code for working with Label Studio users, projects, tasks, task-list views, and passwords. |
| `scripts/label_config.txt` | The Label Studio screen definition for the time-series chart, map, and labels. |
| `scripts/run_label_studio.sh` | Starts Label Studio and sets the project's signup and public-address options. |
| `scripts/admin_runner.sh` | Starts the RiverLabel admin application. |
| `scripts/machine_setup.sh` | Creates the Python environment, installs packages, prepares web files, and installs the server services. |
| `scripts/update_dns_ip.sh` | Updates the Namecheap Dynamic DNS records with the server's public IP address. |
| `services/label_studio.service` | Template service definition for running Label Studio on a server. |
| `services/admin_api.service` | Template service definition for running the RiverLabel admin application on a server. |
| `html/admin.html` | The browser interface for managing users and assignments. |
| `html/signup.html` | The signup form shown by the `/signup` route. |
| `html/static_taggers.html` | Template for the public active-labeler directory. |
| `views/default.json` | Template for the normal task-list view in each labeler project. |
| `views/demo.json` | Template for the demonstration-task view in each labeler project. |
