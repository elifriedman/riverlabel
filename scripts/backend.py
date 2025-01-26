from functools import partial
from label_studio_sdk.client import LabelStudio
from label_studio_sdk.data_manager import Filters, Column, Type, Operator


def get_users(client, emails: list=None):
    users = client.users.list()
    if emails is None:
        return users
    return [user for user in users if user.email in emails]

def make_username(score, active):
    return f"{score}__{active}"

def update_user_score(client, email, score, active):
    users = get_users(client, emails=[email])
    if len(users) == 0:
        raise ValueError(f"User {email} not found")
    user = users[0]
    user = client.users.update(user.id, username=str(score))
    return user


def get_views_for_project(client, project_id):
    return client.views.list(project=project_id)


def get_default_view(client, project_id, views=None):
    if views is None:
        views = get_views_for_project(client, project_id)
    default_view = next(view for view in views if view.data["title"] == "Default")
    return default_view

def add_task_title(task):
    keys = [k for k in task.data.keys() if "name" in k.lower()]
    if len(keys) == 0:
        key = list(task.data.keys())[0]
    else:
        key = keys[0]
    task.data["title"] = str(task.data[key])[:100]
    return task


def get_tasks(client, project_id):
    default_view = get_default_view(client, project_id)
    task_batch = client.tasks.list(project=project_id, view=default_view.id)
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
    tasks = [task for task in tasks if task.data.get("is_copy", False) is False]
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

def update_task_labelers(client, task, labelers):
    data = task.data.copy()
    if "original" not in data:
        data["original"] = task.id
        data["is_copy"] = False
    copies = data.get("copies", {})
    to_delete = [v for k, v in copies.items() if k not in labelers]
    for task_index in to_delete:
        try:
            client.tasks.delete(task_index)
        except:
            pass
    copies = {k: v for k, v in copies.items() if k in labelers}
    project_id = task.project
    for labeler in labelers:
        if labeler not in copies:
            copies[labeler] = create_new_task(client, project_id, data, labeler)
    data["copies"] = copies
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

