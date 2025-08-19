    """
    Useful Info:
    .schema of members is major_role_date, timer_date, grammarian_date, fwc_date, evaluator_date
    """
    agendadf = pd.read_csv("static/temp.csv")
    # print(agendadf.to_string())
    col = agendadf.columns[2]
    agendadf[col] = ""
    agendadf.to_csv("static/temp.csv", index=False)
    if request.method == "POST":
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
    return render_template("agenda.html")




@app.route("/lock-in", methods=["GET", "POST"])
@login_required
def lockin():
    if request.method == "POST":
        for i in range(10): print("posted")
        df = pd.read_csv("static/temp.csv")
        print(df.to_string())
        try:
            if not dicttakens or not takens:
                abort(400)
        except NameError:
            abort(400)
        now = str(round(datetime.datetime.now().timestamp()))
        print(now)
        for item in dicttakens:
            key = list(item.keys())
            key = key[0]
            print(item)
            name = item[key]
            # confirmation = input("About to update db. Continue? (ENTER ANY VALUE TO CONTINUE)")
            db.execute("UPDATE members SET ? = ? WHERE name = ?", key, now, name)
        
        if not pd.isna(df.at[1, "Name"]):
            now = datetime.datetime.now().strftime("%Y-%m-%d")
            shutil.copy("static/temp.csv", "static/agendalog/agenda-{}.csv".format(now))
            agendaname = "agenda-{}.csv".format(now)
            directory = Path("static/agendalog")
            latest_file = max(directory.glob("*"), key=lambda f: f.stat().st_mtime)
            return render_template("lock-in.html", agendaname=agendaname, download=latest_file)
        else:
            abort(400)
        return redirect("/agenda")
    elif request.method == "GET":
        return redirect("/agenda")
    else:
        abort(405)