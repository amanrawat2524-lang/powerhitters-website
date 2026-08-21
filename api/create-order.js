// Power Hitters — Create Razorpay Order
// Entry Fee: ₹2,499
// Online Advance: ₹999
// Remaining: ₹1,500

export async function POST(request) {
  try {
    const {
      RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET,
      SUPABASE_URL,
      SUPABASE_SECRET_KEY
    } = process.env;

    const ADVANCE_AMOUNT = 99900; // ₹999 in paise

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
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json'
    };

    // 1. Verify registration exists
    const registrationResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(
        registrationId
      )}&select=id,team_name,payment_status&limit=1`,
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

    const registrations =
      await registrationResponse.json();

    if (!registrations.length) {
      return Response.json(
        { error: 'Registration not found.' },
        { status: 404 }
      );
    }

    const registration = registrations[0];

    // Already paid — don't create another order
    if (registration.payment_status === 'paid') {
      return Response.json(
        { error: 'Payment has already been completed.' },
        { status: 409 }
      );
    }

    // 2. Check previous payment orders
    const existingResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?registration_id=eq.${encodeURIComponent(
        registrationId
      )}&select=razorpay_order_id,razorpay_payment_id,amount_paise,currency,status,verified,created_at&order=created_at.desc&limit=10`,
      {
        headers: supabaseHeaders
      }
    );

    if (existingResponse.ok) {
      const existingPayments =
        await existingResponse.json();

      // If current ₹999 payment is already captured,
      // don't create another order.
      const completedPayment =
        existingPayments.find(function (payment) {
          return (
            payment.amount_paise === ADVANCE_AMOUNT &&
            payment.status === 'captured' &&
            payment.verified === true
          );
        });

      if (completedPayment) {
        return Response.json(
          { error: 'Payment has already been completed.' },
          { status: 409 }
        );
      }

      // Reuse only a CURRENT ₹999 incomplete order.
      // Old ₹500 orders will NOT be reused.
      const reusablePayment =
        existingPayments.find(function (payment) {
          return (
            payment.amount_paise === ADVANCE_AMOUNT &&
            payment.status === 'created' &&
            payment.verified !== true &&
            payment.razorpay_order_id
          );
        });

      if (reusablePayment) {
        return Response.json({
          success: true,
          reused: true,
          order_id: reusablePayment.razorpay_order_id,
          amount: ADVANCE_AMOUNT,
          currency: reusablePayment.currency || 'INR',
          key_id: RAZORPAY_KEY_ID,
          team_name: registration.team_name
        });
      }
    }

    // 3. Create a brand-new ₹999 Razorpay order
    const receipt =
      'ph_' +
      registrationId
        .replace(/-/g, '')
        .slice(0, 20) +
      '_' +
      Date.now()
        .toString()
        .slice(-10);

    const razorpayAuth = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const razorpayResponse = await fetch(
      'https://api.razorpay.com/v1/orders',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${razorpayAuth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: ADVANCE_AMOUNT,
          currency: 'INR',
          receipt: receipt,
          notes: {
            registration_id: registrationId,
            team_name:
              registration.team_name ||
              'Power Hitters Team'
          }
        })
      }
    );

    const razorpayOrder =
      await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      console.error(
        'Razorpay order creation failed:',
        razorpayOrder
      );

      return Response.json(
        { error: 'Could not create payment order.' },
        { status: 500 }
      );
    }

    // 4. Save new order in Supabase
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
          amount_paise: ADVANCE_AMOUNT,
          currency: 'INR',
          status: 'created',
          verified: false
        })
      }
    );

    if (!savePaymentResponse.ok) {
      console.error(
        'Could not save Razorpay order:',
        await savePaymentResponse.text()
      );

      return Response.json(
        {
          error:
            'Payment order created but could not be saved.'
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      reused: false,
      order_id: razorpayOrder.id,
      amount: ADVANCE_AMOUNT,
      currency: 'INR',
      key_id: RAZORPAY_KEY_ID,
      team_name: registration.team_name
    });

  } catch (error) {
    console.error(
      'Create order error:',
      error
    );

    return Response.json(
      {
        error:
          'Something went wrong while creating payment.'
      },
      { status: 500 }
    );
  }
}
