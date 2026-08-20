// Power Hitters — Create Razorpay Order
// ₹500 advance = 50000 paise

export async function POST(request) {
  try {
    const {
      RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET,
      SUPABASE_URL,
      SUPABASE_SECRET_KEY
    } = process.env;

    // Make sure server secrets are available
    if (
      !RAZORPAY_KEY_ID ||
      !RAZORPAY_KEY_SECRET ||
      !SUPABASE_URL ||
      !SUPABASE_SECRET_KEY
    ) {
      return Response.json(
        { error: 'Server configuration is incomplete.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const registrationId = body.registrationId;

    if (!registrationId) {
      return Response.json(
        { error: 'Registration ID is required.' },
        { status: 400 }
      );
    }

    const supabaseHeaders = {
      apikey: SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json'
    };

    // 1. Check that this registration actually exists
    const registrationResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(
        registrationId
      )}&select=id,team_name&limit=1`,
      {
        headers: supabaseHeaders
      }
    );

    if (!registrationResponse.ok) {
      return Response.json(
        { error: 'Could not verify registration.' },
        { status: 500 }
      );
    }

    const registrations = await registrationResponse.json();

    if (!registrations.length) {
      return Response.json(
        { error: 'Registration not found.' },
        { status: 404 }
      );
    }

    const registration = registrations[0];

    // 2. Check whether an order was already created
    // Prevents creating duplicate Razorpay orders if user refreshes/retries
    const existingResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?registration_id=eq.${encodeURIComponent(
        registrationId
      )}&select=razorpay_order_id,amount_paise,currency,status&order=created_at.desc&limit=1`,
      {
        headers: supabaseHeaders
      }
    );

    if (existingResponse.ok) {
      const existingPayments = await existingResponse.json();

      if (existingPayments.length) {
        const existing = existingPayments[0];

        return Response.json({
          success: true,
          order_id: existing.razorpay_order_id,
          amount: existing.amount_paise,
          currency: existing.currency,
          key_id: RAZORPAY_KEY_ID,
          team_name: registration.team_name
        });
      }
    }

    // ₹500 advance
    const amount = 50000;

    // Razorpay receipt must be unique and max 40 chars
    const receipt =
      'ph_' + registrationId.replace(/-/g, '').slice(0, 32);

    const razorpayAuth = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    // 3. Create Razorpay order
    const razorpayResponse = await fetch(
      'https://api.razorpay.com/v1/orders',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${razorpayAuth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount,
          currency: 'INR',
          receipt: receipt,
          notes: {
            registration_id: registrationId,
            team_name: registration.team_name || 'Power Hitters Team'
          }
        })
      }
    );

    const razorpayOrder = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      console.error('Razorpay order creation failed');
      return Response.json(
        { error: 'Could not create payment order.' },
        { status: 500 }
      );
    }

    // 4. Store Razorpay order in Supabase payments table
    const savePaymentResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments`,
      {
        method: 'POST',
        headers: {
          ...supabaseHeaders,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          registration_id: registrationId,
          razorpay_order_id: razorpayOrder.id,
          amount_paise: amount,
          currency: 'INR',
          status: 'created',
          verified: false
        })
      }
    );

    if (!savePaymentResponse.ok) {
      console.error('Could not save Razorpay order to database');
      return Response.json(
        { error: 'Payment order created but could not be saved.' },
        { status: 500 }
      );
    }

    // Safe information returned to frontend
    return Response.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: RAZORPAY_KEY_ID,
      team_name: registration.team_name
    });
  } catch (error) {
    console.error('Create order error:', error.message);

    return Response.json(
      { error: 'Something went wrong while creating payment.' },
      { status: 500 }
    );
  }
}
