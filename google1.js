const SHEET_NAME = 'Form Data';
const FOLDER_ID = '';

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const data = JSON.parse(e.postData.contents);

    const { State, Designation, HQ, User, Month, Week, Entries, File } = data;

    let fileUrl = '';
    if (File && File.content !== "base64") {
      const decoded = Utilities.base64Decode(File.content);
      const blob = Utilities.newBlob(decoded, File.type, File.name);

      const folder = DriveApp.getFolderById(FOLDER_ID);
      const uploadedFile = folder.createFile(blob);
      fileUrl = uploadedFile.getUrl();
    }

    const timestamp = new Date();
    let row = sheet.getLastRow() + 1;

    Entries.forEach(entry => {
      sheet.getRange(row, 1).setValue(timestamp);
      sheet.getRange(row, 2).setValue(State);
      sheet.getRange(row, 3).setValue(Designation);
      sheet.getRange(row, 4).setValue(HQ);
      sheet.getRange(row, 5).setValue(User);
      sheet.getRange(row, 6).setValue(Month);
      sheet.getRange(row, 7).setValue(Week);
      sheet.getRange(row, 8).setValue(entry.Day);
      sheet.getRange(row, 9).setValue(entry.Place_From);
      sheet.getRange(row, 10).setValue(entry.Place_To);
      sheet.getRange(row, 11).setValue(entry.Distance_KM);
      sheet.getRange(row, 12).setValue(entry.Night_Allowance_Rs);
      sheet.getRange(row, 13).setValue(fileUrl || "");  // blank if file not uploaded
      row++;
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: "Data stored successfully." }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
