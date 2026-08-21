import { createHmac, timingSafeEqual } from 'node:crypto';

// Power Hitters — Razorpay Payment Verification
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

    if (
      !RAZORPAY_KEY_ID ||
      !RAZORPAY_KEY_SECRET ||
      !SUPABASE_URL ||
      !SUPABASE_SECRET_KEY
    ) {
      return Response.json(
        {
          success: false,
          error: 'Server configuration missing.'
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const registrationId = body.registrationId;
    const paymentId = body.razorpay_payment_id;
    const checkoutOrderId = body.razorpay_order_id;
    const razorpaySignature = body.razorpay_signature;

    if (
      !registrationId ||
      !paymentId ||
      !checkoutOrderId ||
      !razorpaySignature
    ) {
      return Response.json(
        {
          success: false,
          error: 'Payment verification data missing.'
        },
        { status: 400 }
      );
    }

    const supabaseHeaders = {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json'
    };

    // Get latest payment/order for this registration
    const paymentRowResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?registration_id=eq.${encodeURIComponent(
        registrationId
      )}&select=id,razorpay_order_id,razorpay_payment_id,amount_paise,currency,status,verified&order=created_at.desc&limit=1`,
      {
        headers: supabaseHeaders
      }
    );

    if (!paymentRowResponse.ok) {
      console.error(
        'Could not load payment record:',
        await paymentRowResponse.text()
      );

      return Response.json(
        {
          success: false,
          error: 'Could not verify payment record.'
        },
        { status: 500 }
      );
    }

    const paymentRows = await paymentRowResponse.json();

    if (!paymentRows.length) {
      return Response.json(
        {
          success: false,
          error: 'Payment order not found.'
        },
        { status: 404 }
      );
    }

    const paymentRow = paymentRows[0];
    const storedOrderId = paymentRow.razorpay_order_id;

    // Only ₹999 orders are valid for the current tournament pricing
    if (paymentRow.amount_paise !== 99900) {
      return Response.json(
        {
          success: false,
          error: 'Old or invalid payment order. Please create a new payment.'
        },
        { status: 409 }
      );
    }

    // Already verified earlier
    if (
      paymentRow.verified === true &&
      paymentRow.razorpay_payment_id === paymentId &&
      paymentRow.status === 'captured'
    ) {
      return Response.json({
        success: true,
        already_verified: true,
        payment_id: paymentId,
        order_id: storedOrderId,
        amount_paid: paymentRow.amount_paise,
        remaining_amount: 150000
      });
    }

    // Checkout order must match our stored order
    if (checkoutOrderId !== storedOrderId) {
      return Response.json(
        {
          success: false,
          error: 'Order ID mismatch.'
        },
        { status: 400 }
      );
    }

    // Verify Razorpay signature
    const expectedSignature = createHmac(
      'sha256',
      RAZORPAY_KEY_SECRET
    )
      .update(`${storedOrderId}|${paymentId}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(razorpaySignature);

    const signatureValid =
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!signatureValid) {
      return Response.json(
        {
          success: false,
          error: 'Payment signature verification failed.'
        },
        { status: 400 }
      );
    }

    // Fetch payment directly from Razorpay
    const razorpayAuth = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const razorpayPaymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Basic ${razorpayAuth}`
        }
      }
    );

    if (!razorpayPaymentResponse.ok) {
      console.error(
        'Could not fetch Razorpay payment:',
        await razorpayPaymentResponse.text()
      );

      return Response.json(
        {
          success: false,
          error: 'Could not confirm payment with Razorpay.'
        },
        { status: 500 }
      );
    }

    let razorpayPayment =
      await razorpayPaymentResponse.json();

    // Verify order
    if (razorpayPayment.order_id !== storedOrderId) {
      return Response.json(
        {
          success: false,
          error: 'Razorpay order mismatch.'
        },
        { status: 400 }
      );
    }

    // ₹999 = 99,900 paise
    if (razorpayPayment.amount !== 99900) {
      return Response.json(
        {
          success: false,
          error: 'Payment amount mismatch.'
        },
        { status: 400 }
      );
    }

    if (razorpayPayment.amount !== paymentRow.amount_paise) {
      return Response.json(
        {
          success: false,
          error: 'Stored payment amount mismatch.'
        },
        { status: 400 }
      );
    }

    if (razorpayPayment.currency !== 'INR') {
      return Response.json(
        {
          success: false,
          error: 'Payment currency mismatch.'
        },
        { status: 400 }
      );
    }

    // Capture if only authorised
    if (razorpayPayment.status === 'authorized') {
      const captureResponse = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(
          paymentId
        )}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${razorpayAuth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: 99900,
            currency: 'INR'
          })
        }
      );

      const captureResult =
        await captureResponse.json();

      if (!captureResponse.ok) {
        console.error(
          'Payment capture failed:',
          captureResult
        );

        return Response.json(
          {
            success: false,
            error: 'Payment authorised but capture failed.'
          },
          { status: 500 }
        );
      }

      razorpayPayment = captureResult;
    }

    // Team confirmed only after capture
    if (razorpayPayment.status !== 'captured') {
      return Response.json(
        {
          success: false,
          error: 'Payment has not been captured yet.',
          payment_status: razorpayPayment.status
        },
        { status: 409 }
      );
    }

    const paidAt = new Date().toISOString();

    // Update payments table
    const updatePaymentResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_order_id=eq.${encodeURIComponent(
        storedOrderId
      )}`,
      {
        method: 'PATCH',
        headers: {
          ...supabaseHeaders,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          razorpay_payment_id: paymentId,
          status: 'captured',
          payment_method: razorpayPayment.method || null,
          verified: true,
          paid_at: paidAt
        })
      }
    );

    if (!updatePaymentResponse.ok) {
      console.error(
        'Could not update payment:',
        await updatePaymentResponse.text()
      );

      return Response.json(
        {
          success: false,
          error: 'Payment verified but database update failed.'
        },
        { status: 500 }
      );
    }

    // Mark registration paid
    const updateRegistrationResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(
        registrationId
      )}`,
      {
        method: 'PATCH',
        headers: {
          ...supabaseHeaders,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          payment_status: 'paid',
          paid_at: paidAt
        })
      }
    );

    if (!updateRegistrationResponse.ok) {
      console.error(
        'Registration update failed:',
        await updateRegistrationResponse.text()
      );

      return Response.json(
        {
          success: false,
          error: 'Payment verified but registration update failed.'
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      verified: true,
      payment_id: paymentId,
      order_id: storedOrderId,
      payment_method: razorpayPayment.method || null,
      amount_paid: 99900,
      remaining_amount: 150000
    });

  } catch (error) {
    console.error(
      'Verify payment error:',
      error
    );

    return Response.json(
      {
        success: false,
        error: 'Unexpected verification error.'
      },
      { status: 500 }
    );
  }
}
