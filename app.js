/*********************************
 * CONFIG (IMPORTANT)
 *********************************/
const SPREADSHEET_ID = "https://script.google.com/macros/s/AKfycbxzZa_bHktlywIA1hZ9UMhHJJwBSY-82Ng0oxjUOlyWis9CCEl8rMciu1E-_0JyZzM/exec";

/*********************************
 * ENTRY POINT
 *********************************/
function doGet(e) {
  e = e || { parameter: {} };

  const action = (e.parameter.action || "list").toLowerCase();
  const person = (e.parameter.person || "").toUpperCase();

  // Ping debug (super utile)
  if (action === "ping") {
    return respond_(e, {
      ok: true,
      ping: "pong",
      gotCallback: Boolean(e.parameter.callback),
      personReceived: person || null
    });
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(person);

  if (!sh) {
    return respond_(e, { ok: false, error: "Sheet not found: " + person });
  }

  if (action === "list") {
    return respond_(e, { ok: true, rows: listRows_(sh) });
  }

  if (action === "add") {
    sh.appendRow([
      e.parameter.date || "",
      e.parameter.time || "",
      Number(e.parameter.viewers || 0),
      Number(e.parameter.likes || 0),
      Number(e.parameter.duration || 0),
      Number(e.parameter.comments || 0),
      Number(e.parameter.revenue || 0),
    ]);
    return respond_(e, { ok: true });
  }

  if (action === "reset") {
    resetSheet_(sh);
    return respond_(e, { ok: true });
  }

  return respond_(e, { ok: false, error: "Invalid action" });
}

/*********************************
 * HELPERS
 *********************************/
function listRows_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).map(r => ({
    date: String(r[0] || ""),
    time: String(r[1] || ""),
    viewers: Number(r[2] || 0),
    likes: Number(r[3] || 0),
    duration: Number(r[4] || 0),
    comments: Number(r[5] || 0),
    revenue: Number(r[6] || 0),
  }));
}

function resetSheet_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 7).clearContent();
}

/*********************************
 * JSONP RESPONSE (CRITICAL)
 *********************************/
function respond_(e, obj) {
  const cb = e.parameter.callback;
  const json = JSON.stringify(obj);

  if (cb) {
    return ContentService
      .createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}