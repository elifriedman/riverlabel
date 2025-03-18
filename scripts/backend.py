import json
from functools import partial
from pathlib import Path
import subprocess
import sys
from label_studio_sdk.client import LabelStudio
from label_studio_sdk.data_manager import Filters, Column, Type, Operator

def load_json(f):
    with open(f) as f:
        return json.load(f)


def get_users(client, emails: list=None):
    users = client.users.list()
    if emails is None:
        return users
    return [user for user in users if user.email in emails]

def make_username(score, active):
    username = f"{score}_{int(active)}"
    return username

def reset_password(email, password):
    try:
        result = subprocess.run(
            [str(Path(sys.executable).parent / "label-studio"), 'reset_password', '--username', email, '--password', password],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        success = result.returncode == 0
        return success
    except Exception as exc:
        logging.exception(f"Error running label-studio reset_password --email {email}", exc_info=exc)
        return False


def add_new_project_if_needed(client, email):
    projects = list(client.projects.list())
    titles = [p.title for p in projects]
    if email in titles:
        project = projects[titles.index(email)]
    else:
        path = Path(__file__).parent / "label_config.txt"
        project = client.projects.create(title=email, label_config=path.read_text())
    return project

def get_views_for_project(client, project_id):
    return client.views.list(project=project_id)


def get_default_view(client, project_id, views=None):
    if views is None:
        views = get_views_for_project(client, project_id)
    default_view = next(view for view in views if view.data["title"] == "Default")
    return default_view

def add_task_title(task):
    if "title" in task.data:
        return task
    keys = [k for k in task.data.keys() if "name" in k.lower()]
    if len(keys) == 0:
        key = list(task.data.keys())[0]
    else:
        key = keys[0]
    task.data["title"] = str(task.data[key])[:100]
    return task


def get_all_tasks(client, project_id):
    tasks = []
    for view in client.views.list(project=project_id):
        new_tasks = get_tasks(client, project_id, view_id=view.id)
        for task in new_tasks:
            task.data['view'] = view.data['title']
        tasks += new_tasks
    ids = set()
    out = []
    for t in tasks:
        if t.id not in ids:
            ids.add(t.id)
            out.append(t)
    return out

def get_tasks(client, project_id, view_id="default"):
    if view_id == "default":
        view_id = get_default_view(client, project_id).id
    task_batch = client.tasks.list(project=project_id, view=view_id)
    tasks = task_batch.items
    paging = True
    while paging:
        try:
            task_batch = task_batch.next_page()
            tasks += task_batch.items
            paging = task_batch.has_next
        except Exception as e:
            paging = False
    tasks = [add_task_title(task) for task in tasks]
    return tasks

def get_task_by_id(client, task_id):
    return client.tasks.get(id=task_id)


def create_new_task(client, project_id, data, labeler):
    data = data.copy()
    if "copies" in data:
        data.pop("copies")
    data["is_copy"] = True
    data["labelers"] = labeler
    task = client.tasks.create(data=data, project=project_id)
    return task.id

def update_task_labelers(client, task, labelers, projects=None):
    if projects is None:
        projects = list(client.projects.list())
    titles = [p.title for p in projects]
    data = task.data.copy()
    new_labelers = [labeler for labeler in labelers if labeler not in data.get("labelers", [])]
    for labeler in new_labelers:
        if labeler not in titles:
            continue
        project = projects[titles.index(labeler)]
        client.tasks.create(data=data, project=project.id)
    data["labelers"] = labelers
    client.tasks.update(task.id, data=data)


def create_view_for_user(client, project_id, user, filter_column="labelers", views=None):
    view_filter = Filters.create(
        Filters.AND,
        [
            Filters.item(
                Column.data(filter_column),
                Operator.CONTAINS,
                Type.String,
                Filters.value(user.email),
            )
        ],
    )
    title = user.email
    if views is None:
        views = get_views_for_project(client, project_id)
    view_template = get_default_view(client, None, views)
    project = view_template.project
    hidden_columns = view_template.data["hiddenColumns"]
    func = client.views.create
    for view in views:
        if view.data["title"] == title:
            func = partial(client.views.update, id=view.id)
            break
    view = func(
        project=project,
        data={"title": title, "filters": view_filter, "hiddenColumns": hidden_columns},
    )
    return view


def delete_view_for_user(client, project_id, user):
    views = get_views_for_project(client, project_id)
    titles = [view.data["title"] for view in views]
    if user.email in titles:
        idx = titles.index(user.email)
        view = views[idx]
        client.views.delete(view.id)

def get_active_users(client):
    users = client.users.list()
    active = [u for u in users if "_" in u.username and u.username.split("_")[1] == "1"]
    return active

def add_all_views(client, project):
    views = client.views.list(project=project.id)
    if len(views) == 0:
        path = Path(__file__).parent / "views/default.json"
        views = [client.views.create(project=project.id, data=load_json(path))]
    if len(views) == 1:
        path = Path(__file__).parent / "views/demo.json"
        views = [client.views.create(project=project.id, data=load_json(path))]

def signup(client, email, score=0, active=True):
    if not isinstance(email, str) or not email:
        return
    email = email.lower()
    emails = [user.email.lower() for user in client.users.list()]
    username = f"{score}_{1 if active else 0}"
    if email not in emails:
        client.users.create(username=username, email=email)
        reset_password(email, "abc123")
    else:
        user = [user for user in client.users.list() if user.email.lower() == email][0]
        client.users.update(id=user.id, username=username)
    projects = list(client.projects.list())
    titles = [p.title for p in projects]
    if email in titles:
        project = projects[titles.index(email)]
    else:
        project = client.projects.create(title=email, label_config=Path("scripts/label_config.txt").read_text())
    add_all_views(client, project)
    return project

