from flask import Flask, flash, redirect, render_template, request, session, abort
from extras import *
import numpy as np, pandas as pd, flask as f, os, csv, random, shutil, datetime
from cs50 import SQL
from werkzeug.security import generate_password_hash, check_password_hash
from flask_session import Session
from pathlib import Path
app = Flask(__name__)
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)
db = SQL("sqlite:///database.db")

@app.after_request
def after_request(response):
    """Ensure responses aren't cached"""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Expires"] = 0
    response.headers["Pragma"] = "no-cache"
    return response


@app.errorhandler(405)
def methodnotallowed(e):
    return render_template("errors/405.html")

@app.errorhandler(400)
def baduser(e):
    return render_template("errors/400.html")

@app.errorhandler(404)
def not_found(e):
    print(session["user_id"])
    return render_template("errors/404.html")

@app.errorhandler(451)
def not_found(e):
    return render_template("errors/451.html")


@app.route("/")
@login_required
def index():
    return render_template("index.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    verdict = ""
    if request.method == "POST":
        verdict = ""
        if not request.form.get("username") or not request.form.get("password"):
            abort(400)
        username = db.execute(
            "SELECT * FROM users WHERE username = ?", request.form.get("username")
        )

        print(username)
        if len(username) != 1 or not check_password_hash(
            username[0]["hash"], request.form.get("password")
        ):
            print("failed")
            verdict = "Incorrect username or password."
            return render_template("login.html", verdict=verdict)
        session["user_id"] = username[0]["id"]
        return redirect("/")

    return render_template("login.html", verdict=verdict)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/"), 301


@app.route("/agenda", methods=["GET", "POST"])
@login_required
def agenda():
    return render_template("agenda1.html")

@app.route("/agenda/2", methods=["GET", "POST"])
def step2():
    meetingType = request.args.get("meetingType")
    if not meetingType:
        abort(400)
    if meetingType == "normal":
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
        for i in range(len(roleids[index])):
            entry = roleids[0][i]

            if isinstance(entry, list):
                for idx in entry:
                    df.at[idx, "Name"] = mjr[0]["name"]
                    print("Successfully added", mjr[0]["name"], "to", df.loc[idx])

            else:
                df.at[entry, "Name"] = mjr[0]["name"]
                print("Successfully added", mjr[0]["name"], "to", df.loc[entry])
            takens.append(mjr[0]["name"])
            dicttakens.append({"major_role_date":mjr[0]["name"]})
            mjr.pop(0)
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
        return render_template("agenda2.html")

    return render_template("placeholder.html")

@app.route("/admin", methods=["GET", "POST"])
@admin_login_required
def admin():
    return render_template("placeholder.html")


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)