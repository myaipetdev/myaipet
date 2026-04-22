/**
 * Google Calendar Connector for PetClaw
 * Pet knows your schedule: "What do I have today?"
 */
import type { ConnectorResult } from "./index";

export class GoogleCalendarConnector {
  private token: string;
  private baseUrl = "https://www.googleapis.com/calendar/v3";

  constructor(oauthToken: string) { this.token = oauthToken; }

  async listEvents(timeMin?: string, timeMax?: string, maxResults = 10): Promise<ConnectorResult> {
    try {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 86400000).toISOString();
      const params = new URLSearchParams({
        timeMin: timeMin || now, timeMax: timeMax || end,
        maxResults: String(maxResults), singleEvents: "true", orderBy: "startTime",
      });
      const res = await fetch(`${this.baseUrl}/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const data = await res.json();
      return { success: true, platform: "google-calendar", data: data.items || [] };
    } catch (e: any) { return { success: false, platform: "google-calendar", data: null, error: e.message }; }
  }

  async createEvent(summary: string, start: string, end: string, description?: string): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${this.baseUrl}/calendars/primary/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary, description,
          start: { dateTime: start }, end: { dateTime: end },
        }),
      });
      return { success: true, platform: "google-calendar", data: await res.json() };
    } catch (e: any) { return { success: false, platform: "google-calendar", data: null, error: e.message }; }
  }

  async todaySchedule(): Promise<ConnectorResult> {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    return this.listEvents(start.toISOString(), end.toISOString(), 20);
  }
}
