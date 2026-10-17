
"use strict";

// Existing Supabase project. Do not reset or recreate the database.
const SUPABASE_URL = "https://tmmdciwammnzzqhlfwiu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fvgRyBKprsRbpHOqrcZCPw_wx1IE01J";

const $ = (id) => document.getElementById(id);

let db = null;
let currentUser = null;
let sheets = [];
let editingId = null;

function showMessage(id, message = "", type = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.className = `message${type ? ` ${type}` : ""}`;

  if (id === "formMessage") {
    element.classList.add("full-width");
  }
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

function setLoggedIn(user) {
  currentUser = user || null;
  const loggedIn = Boolean(currentUser);

  $("authSection").hidden = loggedIn;
  $("appSection").hidden = !loggedIn;

  if (loggedIn) {
    const email = currentUser.email || "Signed in";
    $("userEmail").textContent = email;
    $("sidebarUserEmail").textContent = email;
    $("userInitial").textContent = email.charAt(0).toUpperCase() || "U";
  } else {
    $("userEmail").textContent = "";
    $("sidebarUserEmail").textContent = "Signed out";
    $("userInitial").textContent = "U";
    sheets = [];
    renderSheets();
    updateStats();
  }
}

function updateStats() {
  $("statTotal").textContent = sheets.length;
  $("statVendors").textContent =
    sheets.filter((s) => s.type === "Vendor").length;
  $("statClients").textContent =
    sheets.filter((s) => s.type === "Client").length;
  $("statAdmins").textContent =
    sheets.filter((s) => s.type === "Admin").length;

  $("sheetCount").textContent =
    `${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"}`;
}

function isValidSheetUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" &&
      [
        "docs.google.com",
        "drive.google.com",
        "sheets.google.com"
      ].includes(url.hostname);
  } catch {
    return false;
  }
}

async function loadSheets() {
  if (!db || !currentUser) return;

  $("sheetList").innerHTML =
    '<p class="empty-message">Loading your sheets...</p>';

  try {
    const { data, error } = await db
      .from("sheet_links")
      .select("id, name, type, sheet_url, notes, created_at, updated_at, user_id")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    sheets = data || [];
    renderSheets();
    updateStats();
    showMessage("formMessage", "");
  } catch (error) {
    $("sheetList").innerHTML = "";
    $("emptyMessage").hidden = false;
    $("emptyMessage").textContent = "Could not load sheets. Please try again.";

    showMessage(
      "formMessage",
      `Could not load sheets: ${error.message}`,
      "error"
    );
  }
}

function resetForm() {
  editingId = null;
  $("sheetForm").reset();
  $("type").value = "Vendor";
  $("formTitle").textContent = "Add a sheet";
  $("saveButton").textContent = "Save sheet";
  $("cancelEditButton").hidden = true;
  showMessage("formMessage", "");
}

function makeButton(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderSheets() {
  const list = $("sheetList");
  if (!list) return;

  list.replaceChildren();

  const searchTerm = ($("search")?.value || "").trim().toLowerCase();
  const filter = $("filterType")?.value || "All";

  const filtered = sheets.filter((sheet) => {
    const matchesType = filter === "All" || sheet.type === filter;

    const searchable = [
      sheet.name,
      sheet.type,
      sheet.sheet_url,
      sheet.notes
    ].join(" ").toLowerCase();

    return matchesType && searchable.includes(searchTerm);
  });

  $("emptyMessage").hidden = filtered.length > 0;
  $("emptyMessage").textContent = sheets.length === 0
    ? "No sheets saved yet. Add your first sheet above."
    : "No sheets match your search or category.";

  filtered.forEach((sheet) => {
    const card = document.createElement("article");
    card.className = "sheet-item";

    const top = document.createElement("div");
    top.className = "sheet-item-top";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = sheet.name || "Untitled sheet";

    const type = document.createElement("span");
    type.className = "sheet-type";
    type.textContent = sheet.type || "Other";

    titleWrap.append(title, type);
    top.append(titleWrap);
    card.append(top);

    if (sheet.notes) {
      const notes = document.createElement("p");
      notes.className = "sheet-notes";
      notes.textContent = sheet.notes;
      card.append(notes);
    }

    const url = document.createElement("div");
    url.className = "sheet-url";
    url.textContent = sheet.sheet_url || "";
    card.append(url);

    const actions = document.createElement("div");
    actions.className = "sheet-actions";

    actions.append(
      makeButton("Open sheet ↗", "btn-primary", () => {
        window.open(sheet.sheet_url, "_blank", "noopener,noreferrer");
      }),

      makeButton("Copy URL", "btn-secondary", async () => {
        try {
          await navigator.clipboard.writeText(sheet.sheet_url);
          showMessage("formMessage", "URL copied successfully.", "success");
        } catch {
          window.prompt("Copy this URL:", sheet.sheet_url);
        }
      }),

      makeButton("Edit", "btn-secondary", () => {
        editingId = sheet.id;
        $("name").value = sheet.name || "";
        $("type").value = sheet.type || "Vendor";
        $("sheetUrl").value = sheet.sheet_url || "";
        $("notes").value = sheet.notes || "";

        $("formTitle").textContent = "Edit sheet";
        $("saveButton").textContent = "Update sheet";
        $("cancelEditButton").hidden = false;

        showMessage("formMessage", "");
        $("sheetFormSection").scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }),

      makeButton("Delete", "btn-danger", async () => {
        const confirmed = window.confirm(
          `Delete "${sheet.name}" from your saved sheets?`
        );

        if (!confirmed) return;

        const { error } = await db
          .from("sheet_links")
          .delete()
          .eq("id", sheet.id)
          .eq("user_id", currentUser.id);

        if (error) {
          showMessage("formMessage", error.message, "error");
          return;
        }

        sheets = sheets.filter((item) => item.id !== sheet.id);
        renderSheets();
        updateStats();
        showMessage("formMessage", "Sheet deleted successfully.", "success");
      })
    );

    card.append(actions);
    list.append(card);
  });

  updateStats();
}

async function handleLogin(event) {
  event.preventDefault();

  if (!db) {
    showMessage("authMessage", "Supabase is not connected. Refresh the page.", "error");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;

  setBusy($("loginButton"), true, "Signing in...", "Sign in");
  $("signupButton").disabled = true;
  showMessage("authMessage", "Signing in...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    setLoggedIn(data.user);
    showMessage("authMessage", "");
    await loadSheets();
  } catch (error) {
    showMessage("authMessage", error.message || "Login failed.", "error");
  } finally {
    setBusy($("loginButton"), false, "Signing in...", "Sign in");
    $("signupButton").disabled = false;
  }
}

async function handleSignup() {
  if (!db) {
    showMessage("authMessage", "Supabase is not connected. Refresh the page.", "error");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    showMessage("authMessage", "Enter your email and password first.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("authMessage", "Password must contain at least 6 characters.", "error");
    return;
  }

  setBusy($("signupButton"), true, "Creating account...", "Create account");
  $("loginButton").disabled = true;
  showMessage("authMessage", "Creating account...");

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session && data.user) {
      setLoggedIn(data.user);
      showMessage("authMessage", "");
      await loadSheets();
    } else {
      showMessage(
        "authMessage",
        "Account request successful. Check your email for a confirmation link, then sign in.",
        "success"
      );
    }
  } catch (error) {
    showMessage(
      "authMessage",
      error.message || "Account creation failed.",
      "error"
    );
  } finally {
    setBusy($("signupButton"), false, "Creating account...", "Create account");
    $("loginButton").disabled = false;
  }
}

async function handleLogout() {
  if (!db) return;

  const { error } = await db.auth.signOut();

  if (error) {
    showMessage("formMessage", error.message, "error");
    return;
  }

  setLoggedIn(null);
  resetForm();
  showMessage("authMessage", "You have signed out.", "success");
}

async function handleSaveSheet(event) {
  event.preventDefault();

  if (!db || !currentUser) {
    showMessage("formMessage", "Please sign in again before saving.", "error");
    return;
  }

  const name = $("name").value.trim();
  const type = $("type").value;
  const sheet_url = $("sheetUrl").value.trim();
  const notes = $("notes").value.trim();

  if (!name) {
    showMessage("formMessage", "Please enter a sheet name.", "error");
    return;
  }

  if (!isValidSheetUrl(sheet_url)) {
    showMessage(
      "formMessage",
      "Enter a valid HTTPS Google Sheets or Google Drive URL.",
      "error"
    );
    return;
  }

  const wasEditing = editingId !== null;

  const payload = {
    name,
    type,
    sheet_url,
    notes: notes || null,
    updated_at: new Date().toISOString(),
    user_id: currentUser.id
  };

  setBusy(
    $("saveButton"),
    true,
    wasEditing ? "Updating..." : "Saving...",
    wasEditing ? "Update sheet" : "Save sheet"
  );

  showMessage("formMessage", wasEditing ? "Updating sheet..." : "Saving sheet...");

  try {
    let result;

    if (wasEditing) {
      result = await db
        .from("sheet_links")
        .update(payload)
        .eq("id", editingId)
        .eq("user_id", currentUser.id)
        .select()
        .single();
    } else {
      result = await db
        .from("sheet_links")
        .insert({
          ...payload,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    resetForm();
    await loadSheets();

    showMessage(
      "formMessage",
      wasEditing ? "Sheet updated successfully." : "Sheet saved successfully.",
      "success"
    );
  } catch (error) {
    showMessage(
      "formMessage",
      `Could not save sheet: ${error.message || "Unknown error"}`,
      "error"
    );
  } finally {
    $("saveButton").disabled = false;
    $("saveButton").textContent =
      editingId !== null ? "Update sheet" : "Save sheet";
  }
}

async function initialiseApp() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showMessage(
      "authMessage",
      "Supabase library did not load. Check your internet connection and refresh.",
      "error"
    );
    console.error("Supabase library is missing. Check the CDN script in index.html.");
    return;
  }

  try {
    db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    $("authForm").addEventListener("submit", handleLogin);
    $("signupButton").addEventListener("click", handleSignup);
    $("logoutButton").addEventListener("click", handleLogout);
    $("sheetForm").addEventListener("submit", handleSaveSheet);
    $("cancelEditButton").addEventListener("click", resetForm);
    $("search").addEventListener("input", renderSheets);
    $("filterType").addEventListener("change", renderSheets);

    document.querySelectorAll("[data-filter]").forEach((link) => {
      link.addEventListener("click", () => {
        $("filterType").value = link.dataset.filter;
        renderSheets();
      });
    });

    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    if (data.session?.user) {
      setLoggedIn(data.session.user);
      await loadSheets();
    } else {
      setLoggedIn(null);
    }

    db.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;

      if (user) {
        setLoggedIn(user);
      } else if (currentUser) {
        setLoggedIn(null);
      }
    });
  } catch (error) {
    console.error("Linkify initialization error:", error);
    showMessage(
      "authMessage",
      `App setup failed: ${error.message || "Unknown error"}`,
      "error"
    );
  }
}

document.addEventListener("DOMContentLoaded", initialiseApp);
