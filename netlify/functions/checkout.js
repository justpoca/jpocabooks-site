// J. POCA Books - Stripe checkout engine
// Lives at netlify/functions/checkout.js
// Takes the cart, builds a real Stripe checkout, hands back the pay link.

const Stripe = require('stripe');

// Books that must ring up as a REAL Stripe product (so BookFunnel delivers them).
// Map the cart item id to its Stripe Price ID.
const STRIPE_PRICE_IDS = {
  'throne-ebook': 'price_1U6ylfFCa8EJmEXrnBOsGNCr'
};

exports.handler = async function (event) {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { items } = JSON.parse(event.body || '{}');

    if (!items || !items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
    }

    // Build one Stripe line for each book in the cart.
    // If the item has a real Stripe Price ID, use it (BookFunnel watches these).
    // Otherwise build the price on the fly like before.
    const line_items = items.map(function (it) {
      if (STRIPE_PRICE_IDS[it.id]) {
        return {
          price: STRIPE_PRICE_IDS[it.id],
          quantity: it.qty
        };
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: it.title + ' (' + it.fmt + ')' },
          unit_amount: Math.round(it.price * 100) // cents
        },
        quantity: it.qty
      };
    });

    // Add flat $5.99 shipping once, only if a paperback is in the cart
    const hasPaper = items.some(function (it) { return it.ship; });
    if (hasPaper) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Shipping' },
          unit_amount: 599
        },
        quantity: 1
      });
    }

    const origin =
      (event.headers && (event.headers.origin || 'https://' + event.headers.host)) || '';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: line_items,
      shipping_address_collection: hasPaper ? { allowed_countries: ['US', 'CA'] } : undefined,
      success_url: origin + '/?paid=1',
      cancel_url: origin + '/?canceled=1'
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
