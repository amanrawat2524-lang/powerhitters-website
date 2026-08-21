import { createHmac, timingSafeEqual } from 'node:crypto';

// Power Hitters — Razorpay Webhook
// Entry Fee: ₹2,499
// Online Advance: ₹999
// Remaining: ₹1,500

export async function POST(request) {
  try {
    const {
      RAZORPAY_WEBHOOK_SECRET,
      SUPABASE_URL,
      SUPABASE_SECRET_KEY
    } = process.env;

    if (
      !RAZORPAY_WEBHOOK_SECRET ||
      !SUPABASE_URL ||
      !SUPABASE_SECRET_KEY
    ) {
      return new Response('Server configuration missing', {
        status: 500
      });
    }

    // IMPORTANT:
    // Razorpay signature must use the RAW request body.
    const rawBody = await request.text();

    const receivedSignature =
      request.headers.get('x-razorpay-signature');

    if (!receivedSignature) {
      return new Response('Missing signature', {
        status: 400
      });
    }

    const expectedSignature = createHmac(
      'sha256',
      RAZORPAY_WEBHOOK_SECRET
    )
      .update(rawBody)
      .digest('hex');

    const expectedBuffer =
      Buffer.from(expectedSignature);

    const receivedBuffer =
      Buffer.from(receivedSignature);

    const signatureValid =
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(
        expectedBuffer,
        receivedBuffer
      );

    if (!signatureValid) {
      console.error('Invalid webhook signature');

      return new Response('Invalid signature', {
        status: 400
      });
    }

    const event = JSON.parse(rawBody);

    // We only process captured payments.
    if (event.event !== 'payment.captured') {
      return new Response('Ignored event', {
        status: 200
      });
    }

    const payment =
      event &&
      event.payload &&
      event.payload.payment &&
      event.payload.payment.entity;

    if (!payment) {
      return new Response('Invalid payload', {
        status: 400
      });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amount = payment.amount;
    const currency = payment.currency;
    const method = payment.method;

    if (!paymentId || !orderId) {
      return new Response('Missing payment data', {
        status: 400
      });
    }

    // Current Power Hitters advance is exactly ₹999.
    // Ignore any old ₹500 payment events.
    if (amount !== 99900) {
      console.log(
        'Ignoring non-current payment amount:',
        amount
      );

      return new Response('Ignored old payment amount', {
        status: 200
      });
    }

    if (currency !== 'INR') {
      return new Response('Currency mismatch', {
        status: 400
      });
    }

    const supabaseHeaders = {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json'
    };

    // Find our payment using Razorpay Order ID.
    const paymentRowResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_order_id=eq.${encodeURIComponent(
        orderId
      )}&select=id,registration_id,amount_paise,currency,status,verified,razorpay_payment_id&limit=1`,
      {
        headers: supabaseHeaders
      }
    );

    if (!paymentRowResponse.ok) {
      console.error(
        'Webhook payment lookup failed:',
        await paymentRowResponse.text()
      );

      return new Response('Database lookup failed', {
        status: 500
      });
    }

    const paymentRows =
      await paymentRowResponse.json();

    if (!paymentRows.length) {
      console.error(
        'Webhook: no matching payment order found',
        orderId
      );

      return new Response('Payment order not found', {
        status: 404
      });
    }

    const paymentRow = paymentRows[0];

    // Stored order must also be a current ₹999 order.
    if (paymentRow.amount_paise !== 99900) {
      console.error(
        'Webhook: old payment row found',
        orderId
      );

      return new Response('Ignored old payment order', {
        status: 200
      });
    }

    // Security checks.
    if (amount !== paymentRow.amount_paise) {
      return new Response('Amount mismatch', {
        status: 400
      });
    }

    if (currency !== paymentRow.currency) {
      return new Response('Currency mismatch', {
        status: 400
      });
    }

    // Idempotency:
    // If already verified, do not process again.
    if (
      paymentRow.verified === true &&
      paymentRow.status === 'captured' &&
      paymentRow.razorpay_payment_id === paymentId
    ) {
      return new Response('Already processed', {
        status: 200
      });
    }

    const paidAt = new Date().toISOString();

    // Update payments table.
    const updatePaymentResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payments?razorpay_order_id=eq.${encodeURIComponent(
        orderId
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
          payment_method: method || null,
          verified: true,
          paid_at: paidAt
        })
      }
    );

    if (!updatePaymentResponse.ok) {
      console.error(
        'Webhook payment update failed:',
        await updatePaymentResponse.text()
      );

      return new Response('Payment update failed', {
        status: 500
      });
    }

    // Mark related registration paid.
    const updateRegistrationResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(
        paymentRow.registration_id
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
        'Webhook registration update failed:',
        await updateRegistrationResponse.text()
      );

      return new Response(
        'Registration update failed',
        {
          status: 500
        }
      );
    }

    return new Response('Webhook processed', {
      status: 200
    });

  } catch (error) {
    console.error(
      'Webhook error:',
      error
    );

    return new Response('Webhook error', {
      status: 500
    });
  }
}
