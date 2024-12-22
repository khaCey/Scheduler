const CODE_SHEET = "Code";
const LESSON_LENGTH = 60; // Duration of each lesson in minutes
const MAX_LESSONS = 2; // Max bookings per slot

// Serve the HTML file for the web app
function doGet() {
  const template = HtmlService.createTemplateFromFile("index");
  return template.evaluate();
}

// Get the weekly schedule for frontend use
function getWeeklyScheduleForFrontend(startDate, endDate) {
  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required");
  }
  return getWeeklySchedule(startDate, endDate);
}

// Fetch the weekly schedule for the specified range
function getWeeklySchedule(startDate, endDate) {
  const codeSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CODE_SHEET);
  const calendarId = codeSheet.getRange("B5").getValue();
  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    return { error: `Calendar with ID ${calendarId} not found.` };
  }

  const regularHours = getRegularHours(codeSheet);
  const specificHours = getSpecificHours(codeSheet);

  const start = new Date(startDate);
  const end = new Date(endDate);

  const weeklySlots = { summary: [], slots: {} };

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.toLocaleDateString("en-GB", { weekday: "long" });

    const openingHours = getOpeningHoursForDay(codeSheet, date, regularHours, specificHours);
    const slots = calculateDaySlots(dateStr, openingHours, calendar);

    weeklySlots.slots[dateStr] = slots;
    weeklySlots.summary.push({
      date: dateStr,
      day: dayOfWeek,
      opening: openingHours.open,
      closing: openingHours.close,
    });
  }

  return weeklySlots;
}

// Retrieve regular hours (C1:E8 in the sheet)
function getRegularHours(sheet) {
  const regularHoursData = sheet.getRange("C1:E8").getValues();
  const regularHours = {};
  regularHoursData.forEach(([day, open, close]) => {
    if (day && open && close) {
      regularHours[day.toString().trim()] = {
        open: formatTime(open),
        close: formatTime(close),
      };
    }
  });
  return regularHours;
}

// Retrieve specific hours (F1:H in the sheet)
function getSpecificHours(sheet) {
  const specificHoursData = sheet.getRange("F1:H").getValues();
  const specificHours = {};
  specificHoursData.forEach(([date, open, close]) => {
    if (date && open && close) {
      specificHours[date.toString().trim()] = {
        open: formatTime(open),
        close: formatTime(close),
      };
    }
  });
  return specificHours;
}

// Get opening and closing hours for a specific day
function getOpeningHoursForDay(sheet, date, regularHours, specificHours) {
  const dateStr = date.toISOString().split("T")[0];
  const dayOfWeek = date.toLocaleDateString("en-GB", { weekday: "long" });

  if (specificHours[dateStr]) {
    return specificHours[dateStr];
  }

  if (regularHours[dayOfWeek]) {
    return regularHours[dayOfWeek];
  }

  return { open: "closed", close: "closed" };
}

// Calculate slots for a specific day
function calculateDaySlots(dateStr, openingHours, calendar) {
  const { open, close } = openingHours;

  if (open === "closed" || close === "closed") {
    return [{ time: "10:00", available: "closed" }];
  }

  const timeSlots = [];
  const startTime = new Date(`${dateStr}T10:00:00`);
  const endTime = new Date(`${dateStr}T21:00:00`);
  const closingTime = new Date(`${dateStr}T${close}:00`);

  while (startTime < endTime) {
    const slotTime = startTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    if (startTime >= closingTime) {
      timeSlots.push({ time: slotTime, available: "closed" });
    } else {
      timeSlots.push({ time: slotTime, available: MAX_LESSONS });
    }

    startTime.setMinutes(startTime.getMinutes() + LESSON_LENGTH);
  }

  const events = calendar.getEvents(new Date(`${dateStr}T00:00:00`), new Date(`${dateStr}T23:59:59`));
  const bookings = events.reduce((acc, event) => {
    const eventTime = event.getStartTime().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    acc[eventTime] = (acc[eventTime] || 0) + 1;
    return acc;
  }, {});

  timeSlots.forEach((slot) => {
    if (slot.available !== "closed" && bookings[slot.time]) {
      slot.available -= bookings[slot.time];

      // Update slot state based on remaining availability
      if (slot.available <= 0) {
        slot.available = "fully booked";
      } else if (slot.available < MAX_LESSONS) {
        slot.available = "partially booked";
      }
    }
  });

  return timeSlots;
}

// Helper function to format time as HH:mm
function formatTime(time) {
  if (time instanceof Date) {
    return time.toTimeString().slice(0, 5);
  }
  return time.toString().trim();
}
