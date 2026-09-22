/** Debug iCloud CardDAV import. Usage: npx tsx scripts/test-carddav.ts */
export {};

process.loadEnvFile();

async function main() {
  // Dynamic import so module-level process.env reads see the loaded .env.
  const { fetchAppleContacts } = await import("../src/lib/contacts/apple");
  console.log("user:", process.env.CALDAV_USERNAME ? "set" : "MISSING");
  console.log("pass:", process.env.CALDAV_APP_PASSWORD ? "set" : "MISSING");
  try {
    const contacts = await fetchAppleContacts();
    console.log(`fetched ${contacts.length} contacts`);
    console.log(contacts.slice(0, 3));
  } catch (e) {
    console.error("FAILED:", e);
  }
}

main();
