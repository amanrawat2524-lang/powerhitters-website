// Season 3 registration is closed. Existing payment verification remains separate.
export async function POST() {
  return Response.json(
    { error: 'Registrations are closed. New registration payments are not accepted.' },
    { status: 403 }
  );
}
