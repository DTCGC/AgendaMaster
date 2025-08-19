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