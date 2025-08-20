import requests
import pandas as pd, random
from flask import redirect, render_template, session, abort
from functools import wraps

def login_required(f):
    """
    Decorate routes to require login.

    https://flask.palletsprojects.com/en/latest/patterns/viewdecorators/
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            return redirect("/login")
        return f(*args, **kwargs)

    return decorated_function

def admin_login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            return redirect("/login")
        elif session.get("user_id") == 2:
            abort(451)
        return f(*args, **kwargs)
    return decorated_function

def normalmeeting(db):
        """
        Useful Info:
        .schema of members is major_role_date, timer_date, grammarian_date, fwc_date, evaluator_date
        """
        agendadf = pd.read_csv("static/temp.csv")
        col = agendadf.columns[2]
        agendadf[col] = ""
        agendadf.to_csv("static/temp.csv", index=False)
        # Create a database to read off of first
        df = pd.read_csv("static/agenda_template.csv")
        df.columns = df.columns.str.strip().str.title()
        mjr = db.execute(
            "SELECT name, major_role_date FROM members ORDER BY major_role_date LIMIT 6"
        )
        tr = db.execute(
            "SELECT name, timer_date FROM members ORDER BY timer_date"
        ) # LIMIT 1
        grm = db.execute(
            "SELECT name, grammarian_date FROM members ORDER BY grammarian_date") # LIMIT 1
        fwc = db.execute("SELECT name, fwc_date FROM members ORDER BY fwc_date") # LIMIT 1
        eval = db.execute(
            "SELECT name, evaluator_date FROM members ORDER BY evaluator_date") # LIMIT 5
        mbs = db.execute("SELECT name FROM members")
        # print(roles)

        """
        Format for variable roleids:
        [MAJOR ROLE[TM, QM, S1, S2, S3, TTM], TIMER, GRAMMARIAN, FWC, EVALUATOR]
        """
        roleids = [
            [[1, 20], [5, 18], 6, 7, 8, 12],
            [2, 15],
            [3, 16],
            [4, 17],
            [9, 10, 11, 13, 14],
        ]
        global takens, dicttakens
        takens = []
        dicttakens = []
        # roleids2 = [[1, 20, 5, 18, 6, 7, 8, 12], [2, 15], [3, 16], [4, 17], [9, 10, 11, 13, 14]] # im stupid, ok?

        # Start by populating major roles
        index = 0
        mjr_df = pd.read_csv("static/majorroles.csv")
        mjr_df.columns = mjr_df.columns.str.strip()
        print(mjr_df)
        for i in range(len(roleids[index])):
            entry = roleids[index][i]   # fixed: use correct sublist

            if isinstance(entry, list):
                if entry[0] == 1:
                    for idx in entry:
                        df.at[idx, "Name"] = mjr_df.at[0, 'person']
                        appended = mjr_df.at[0, 'person']
                elif entry[0] == 5:
                    for idx in entry:
                        df.at[idx, "Name"] = mjr_df.at[5, 'person']
                        appended = mjr_df.at[5, 'person']
            else:
                df.at[entry, "Name"] = mjr_df.at[i, 'person']
                appended = mjr_df.at[i, 'person']

            takens.append(appended)
            dicttakens.append({"major_role_date": appended})
        index += 1
        '''Populate Minor Roles, in this order: Timer, Grammarian, FWC, Evaluator'''

        for i in range(len(roleids[index])):
            entry = roleids[index]
            for member in tr:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member['name'])
                    dicttakens.append({"timer_date": member["name"]})
                    print("Successfully added", assigned_member, "to", df.loc[entry[0]])
                    break
            if assigned_member:
                for value in entry:
                    df.at[value, "Name"] = assigned_member

        index += 1
        for i in range(len(roleids[index])):
            entry = roleids[index]
            for member in grm:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member['name'])
                    dicttakens.append({"grammarian_date": member["name"]})

                    print("Successfully added", assigned_member, "to", df.loc[entry[0]])
                    break
            if assigned_member:
                for value in entry:
                    df.at[value, "Name"] = assigned_member

        index += 1

        for i in range(len(roleids[index])):
            entry = roleids[index]
            for member in fwc:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member["name"])
                    dicttakens.append({"fwc_date": member["name"]})
                    print("Successfully added", assigned_member, "to", df.loc[entry[0]])
                    break
            if assigned_member:
                for value in entry:
                    df.at[value, "Name"] = assigned_member
        index += 1

        for i in range(len(roleids[index])):
            entry = roleids[index][i]
            for member in eval:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member["name"])
                    dicttakens.append({"evaluator_date": member["name"]})
                    print("Successfully added", assigned_member, "to", df.loc[entry])
                    break
            if assigned_member:
                try:
                    for value in entry:
                        df.at[value, "Name"] = assigned_member
                except TypeError:
                    df.at[entry, "Name"] = assigned_member
        df.at[19, "Name"] = "-"
        while True:
            saa = random.choice(mbs)["name"]
            print(saa)
            print(takens)
            if saa not in takens:
                df.at[0, "Name"] = saa
                takens.append(saa)
                print("Successfully added", saa, "to", df.loc[0])
                break

        df.to_csv("static/temp.csv", index=False)



def edumeeting(db):
        """
        Useful Info:
        .schema of members is major_role_date, timer_date, grammarian_date, fwc_date, evaluator_date
        """
        agendadf = pd.read_csv("static/temp_edu.csv")
        col = agendadf.columns[2]
        agendadf[col] = ""
        agendadf.to_csv("static/temp_edu.csv", index=False)
        # Create a database to read off of first
        df = pd.read_csv("static/agenda_template_edu.csv")
        df.columns = df.columns.str.strip().str.title()
        mjr = db.execute(
            "SELECT name, major_role_date FROM members ORDER BY major_role_date LIMIT 6"
        )
        tr = db.execute(
            "SELECT name, timer_date FROM members ORDER BY timer_date"
        ) # LIMIT 1
        grm = db.execute(
            "SELECT name, grammarian_date FROM members ORDER BY grammarian_date") # LIMIT 1
        fwc = db.execute("SELECT name, fwc_date FROM members ORDER BY fwc_date") # LIMIT 1
        eval = db.execute(
            "SELECT name, evaluator_date FROM members ORDER BY evaluator_date") # LIMIT 5
        mbs = db.execute("SELECT name FROM members")
        # print(roles)

        """
        Format for variable roleids:
        [MAJOR ROLE[TM, QM, S1, S2, S3, TTM], TIMER, GRAMMARIAN, FWC, EVALUATOR]
        """
        roleids = [
            [[1, 20], [5, 18], 6, 7, 8, 12],
            [2, 15],
            [3, 16],
            [4, 17],
            [9, 10, 11, 13, 14],
        ]
        global takens, dicttakens
        takens = []
        dicttakens = []
        # roleids2 = [[1, 20, 5, 18, 6, 7, 8, 12], [2, 15], [3, 16], [4, 17], [9, 10, 11, 13, 14]] # im stupid, ok?

        # Start by populating major roles
        index = 0
        mjr_df = pd.read_csv("static/majorroles.csv")
        mjr_df.columns = mjr_df.columns.str.strip()
        print(mjr_df)
        for i in range(len(roleids[index])):
            entry = roleids[index][i]   # fixed: use correct sublist

            if isinstance(entry, list):
                if entry[0] == 1:
                    for idx in entry:
                        df.at[idx, "Name"] = mjr_df.at[0, 'person']
                        appended = mjr_df.at[0, 'person']
                elif entry[0] == 5:
                    for idx in entry:
                        df.at[idx, "Name"] = mjr_df.at[5, 'person']
                        appended = mjr_df.at[5, 'person']
            else:
                df.at[entry, "Name"] = mjr_df.at[i, 'person']
                appended = mjr_df.at[i, 'person']
            takens.append(appended)
            dicttakens.append({"major_role_date": appended})
        with open("static/educator.txt", "r") as file:
            educator = file.readline().strip()
        df.at[8, "Name"] = educator
        index += 1
        '''Populate Minor Roles, in this order: Timer, Grammarian, FWC, Evaluator'''

        for i in range(len(roleids[index])):
            entry = roleids[index]
            for member in tr:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member['name'])
                    dicttakens.append({"timer_date": member["name"]})
                    print("Successfully added", assigned_member, "to", df.loc[entry[0]])
                    break
            if assigned_member:
                for value in entry:
                    df.at[value, "Name"] = assigned_member

        index += 1
        for i in range(len(roleids[index])):
            entry = roleids[index]
            for member in grm:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member['name'])
                    dicttakens.append({"grammarian_date": member["name"]})

                    print("Successfully added", assigned_member, "to", df.loc[entry[0]])
                    break
            if assigned_member:
                for value in entry:
                    df.at[value, "Name"] = assigned_member

        index += 1

        for i in range(len(roleids[index])):
            entry = roleids[index]
            for member in fwc:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member["name"])
                    dicttakens.append({"fwc_date": member["name"]})
                    print("Successfully added", assigned_member, "to", df.loc[entry[0]])
                    break
            if assigned_member:
                for value in entry:
                    df.at[value, "Name"] = assigned_member
        index += 1

        for i in range(len(roleids[index])):
            entry = roleids[index][i]
            for member in eval:
                if member["name"] not in takens:
                    assigned_member = member["name"]
                    takens.append(member["name"])
                    dicttakens.append({"evaluator_date": member["name"]})
                    print("Successfully added", assigned_member, "to", df.loc[entry])
                    break
            if assigned_member:
                try:
                    for value in entry:
                        df.at[value, "Name"] = assigned_member
                except TypeError:
                    df.at[entry, "Name"] = assigned_member
        df.at[19, "Name"] = "-"
        while True:
            saa = random.choice(mbs)["name"]
            print(saa)
            print(takens)
            if saa not in takens:
                df.at[0, "Name"] = saa
                takens.append(saa)
                print("Successfully added", saa, "to", df.loc[0])
                break

        df.to_csv("static/temp_edu.csv", index=False)


import sqlite3, csv, os
from dataclasses import dataclass
from typing import List, Dict, Optional

DB_PATH = "database.db"
MAJOR_ROLES_CSV = "major_roles.csv"

@dataclass
class Member:
    id: int
    name: str
    major_role_date: int
    timer_date: int
    grammarian_date: int
    fwc_date: int
    evaluator_date: int

def get_conn():
    return sqlite3.connect(DB_PATH)

def fetch_members() -> List[Member]:
    with get_conn() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id,name,major_role_date,timer_date,grammarian_date,fwc_date,evaluator_date FROM members"
        ).fetchall()
    return [Member(**dict(r)) for r in rows]

def norm_key(s: str) -> str:
    return "".join(ch.lower() for ch in s if ch.isalnum())

def load_major_roles() -> Dict[str, str]:
    mapping = {}
    if not os.path.exists(MAJOR_ROLES_CSV):
        return mapping
    with open(MAJOR_ROLES_CSV, newline="", encoding="utf-8") as f:
        for role, person, *rest in csv.reader(f):
            if role and person:
                mapping[norm_key(role)] = person
    return mapping

def is_fixed_role(role: str) -> bool:
    return role.strip().lower() in (
        "toastmaster",
        "table topics master",
        "speaker 1",
        "speaker 2",
        "speaker 3",
        "quizmaster",
    )

ROLE_TO_FIELD = {
    "timer": "timer_date",
    "grammarian": "grammarian_date",
    "filler word counter": "fwc_date",
    "evaluator 1": "evaluator_date",
    "evaluator 2": "evaluator_date",
    "evaluator 3": "evaluator_date",
    "table topics evaluator 1": "evaluator_date",
    "table topics evaluator 2": "evaluator_date",
}

DEFAULT_AGENDA_NORMAL = [
    ("6:45 PM", "Seargent at Arms"),
    ("6:47 PM", "Toastmaster"),
    ("6:49 PM", "Timer"),
    ("6:51 PM", "Grammarian"),
    ("6:53 PM", "Filler Word Counter"),
    ("6:55 PM", "Quizmaster"),
    ("6:57 PM", "Speaker 1"),
    ("7:04 PM", "Speaker 2"),
    ("7:13 PM", "Speaker 3"),
    ("7:22 PM", "Evaluator 1"),
    ("7:25 PM", "Evaluator 2"),
    ("7:28 PM", "Evaluator 3"),
    ("7:45 PM", "Table Topics Master"),
    ("8:05 PM", "Table Topics Evaluator 1"),
    ("8:10 PM", "Table Topics Evaluator 2"),
    ("8:15 PM", "Timer"),
    ("8:17 PM", "Grammarian"),
    ("8:19 PM", "Filler Word Counter"),
    ("8:21 PM", "Quizmaster"),
    ("8:29 PM", "Comments and Closing Remarks"),
    ("8:30 PM", "Toastmaster"),
]

DEFAULT_AGENDA_EDU = [(t, "Education Session" if r.lower()=="speaker 3" else r)
                      for t,r in DEFAULT_AGENDA_NORMAL]

def load_agenda_rows(meeting_type: str):
    return DEFAULT_AGENDA_EDU if meeting_type=="education" else DEFAULT_AGENDA_NORMAL

def role_field(role: str) -> Optional[str]:
    return ROLE_TO_FIELD.get(role.strip().lower())

def initial_assignments(agenda_rows, members, major_map):
    fixed_people = set()
    for row in agenda_rows:
        if is_fixed_role(row["role"]):
            row["fixed"] = True
            row["person"] = major_map.get(norm_key(row["role"]), "")
            if row["person"]:
                fixed_people.add(row["person"])

    used = set(fixed_people)
    for row in agenda_rows:
        if row["fixed"]: continue
        if row["role"].lower() in ("comments and closing remarks",):
            row["person"] = ""
            continue
        col = role_field(row["role"])
        candidates = [m for m in members if m.name not in used]
        if not candidates:
            row["person"] = ""
            continue
        candidates.sort(key=lambda m: getattr(m, col) if col else m.major_role_date)
        chosen = candidates[0]
        row["person"] = chosen.name
        used.add(chosen.name)
