const { pool } = require('../config/db');
const TeamModel = require('../models/teamModel');

// Stripe initialization - check if keys are configured
let stripe;
try {
    if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        console.log('✅ Stripe initialized successfully');
    }
} catch (error) {
    console.warn('❌ Stripe initialization failed:', error.message);
}

/**
 * Billing Controller - Handles Stripe payments and subscriptions
 */
class BillingController {

    /**
     * Get billing status for team
     * GET /api/billing/status
     */
    static async getStatus(req, res) {
        try {
            const teamId = req.teamId;

            const team = await TeamModel.findById(teamId);
            const memberCount = await TeamModel.getMemberCount(teamId);

            // Get subscription info if exists
            const [subscriptions] = await pool.query(
                `SELECT * FROM subscriptions WHERE team_id = ? ORDER BY created_at DESC LIMIT 1`,
                [teamId]
            );

            const subscription = subscriptions[0];

            res.json({
                success: true,
                data: {
                    plan: team.plan,
                    member_count: memberCount,
                    member_limit: team.member_limit,
                    extra_members_needed: Math.max(0, memberCount - 5),
                    price_per_member: 0.99,
                    currency: 'GBP',
                    subscription: subscription ? {
                        status: subscription.status,
                        current_period_end: subscription.current_period_end,
                        cancel_at_period_end: subscription.cancel_at_period_end
                    } : null
                }
            });
        } catch (error) {
            console.error('Get billing status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get billing status'
            });
        }
    }

    /**
     * Create checkout session for adding members
     * POST /api/billing/checkout
     */
    static async createCheckout(req, res) {
        try {
            if (!stripe) {
                return res.status(503).json({
                    success: false,
                    message: 'Stripe is not configured. Please add STRIPE_SECRET_KEY to your environment.'
                });
            }

            const teamId = req.teamId;
            const { extraMembers } = req.body;
            console.log('Checkout Request - Team ID:', teamId, 'Body:', req.body);

            if (!extraMembers || extraMembers < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Specify number of extra members to add'
                });
            }

            const team = await TeamModel.findById(teamId);

            // Get or create Stripe customer
            let customerId = team.stripe_customer_id;

            if (!customerId) {
                const customer = await stripe.customers.create({
                    email: req.user.email,
                    name: req.user.name,
                    metadata: {
                        team_id: teamId,
                        team_name: team.name
                    }
                });
                customerId = customer.id;

                // Save customer ID
                await pool.query(
                    `UPDATE teams SET stripe_customer_id = ? WHERE id = ?`,
                    [customerId, teamId]
                );
            }

            // Create checkout session
            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Extra Team Members',
                            description: `Add ${extraMembers} extra member(s) to ${team.name}`
                        },
                        unit_amount: 99, // £0.99 in pence
                        recurring: {
                            interval: 'month'
                        }
                    },
                    quantity: extraMembers
                }],
                mode: 'subscription',
                success_url: `${process.env.APP_URL || 'http://localhost:8081'}/team-dashboard?success=true`,
                cancel_url: `${process.env.APP_URL || 'http://localhost:8081'}/team-dashboard?canceled=true`,
                metadata: {
                    team_id: teamId.toString(),
                    extra_members: extraMembers.toString()
                }
            });

            res.json({
                success: true,
                data: {
                    checkout_url: session.url,
                    session_id: session.id
                }
            });
        } catch (error) {
            console.error('Create checkout error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create checkout session'
            });
        }
    }

    /**
     * Check checkout session status
     * GET /api/billing/session-status/:sessionId
     */
    static async checkSessionStatus(req, res) {
        try {
            if (!stripe) {
                return res.status(503).json({ success: false, message: 'Stripe not configured' });
            }

            const { sessionId } = req.params;
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (session.payment_status === 'paid') {
                // If paid but webhook hasn't processed it yet, we can trigger the update here too
                // to make UI faster. Webhook will still run as a safety net.
                await BillingController.handleCheckoutComplete(session);

                return res.json({
                    success: true,
                    status: 'paid',
                    message: 'Payment was successful'
                });
            }

            res.json({
                success: true,
                status: session.payment_status,
                message: `Payment status: ${session.payment_status}`
            });
        } catch (error) {
            console.error('Check session status error:', error);
            res.status(500).json({ success: false, message: 'Failed to check session status' });
        }
    }

    /**
     * Stripe webhook handler
     * POST /api/billing/webhook
     */
    static async handleWebhook(req, res) {
        try {
            if (!stripe) {
                return res.status(503).json({ success: false, message: 'Stripe not configured' });
            }

            const sig = req.headers['stripe-signature'];
            let event;

            try {
                event = stripe.webhooks.constructEvent(
                    req.body,
                    sig,
                    process.env.STRIPE_WEBHOOK_SECRET
                );
            } catch (err) {
                console.error('Webhook signature verification failed:', err.message);
                return res.status(400).json({ error: 'Invalid signature' });
            }

            // Handle the event
            switch (event.type) {
                case 'checkout.session.completed': {
                    const session = event.data.object;
                    await BillingController.handleCheckoutComplete(session);
                    break;
                }

                case 'invoice.paid': {
                    const invoice = event.data.object;
                    await BillingController.handleInvoicePaid(invoice);
                    break;
                }

                case 'invoice.payment_failed': {
                    const invoice = event.data.object;
                    await BillingController.handlePaymentFailed(invoice);
                    break;
                }

                case 'customer.subscription.updated': {
                    const subscription = event.data.object;
                    await BillingController.handleSubscriptionUpdate(subscription);
                    break;
                }

                case 'customer.subscription.deleted': {
                    const subscription = event.data.object;
                    await BillingController.handleSubscriptionDeleted(subscription);
                    break;
                }

                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }

            res.json({ received: true });
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: 'Webhook handler failed' });
        }
    }

    /**
     * Handle checkout completion
     */
    static async handleCheckoutComplete(session) {
        const teamId = parseInt(session.metadata.team_id);
        const extraMembers = parseInt(session.metadata.extra_members);

        // Update team plan and member limit
        const currentTeam = await TeamModel.findById(teamId);
        const newLimit = 5 + extraMembers;

        await pool.query(
            `UPDATE teams SET plan = 'pro', member_limit = ? WHERE id = ?`,
            [newLimit, teamId]
        );

        // Create subscription record
        await pool.query(
            `INSERT INTO subscriptions (team_id, stripe_subscription_id, stripe_customer_id, status, plan, quantity)
             VALUES (?, ?, ?, 'active', 'pro', ?)
             ON DUPLICATE KEY UPDATE status = 'active', quantity = ?`,
            [teamId, session.subscription, session.customer, extraMembers, extraMembers]
        );

        console.log(`Team ${teamId} upgraded with ${extraMembers} extra members`);
    }

    /**
     * Handle successful payment
     */
    static async handleInvoicePaid(invoice) {
        const subscriptionId = invoice.subscription;

        // Update subscription status
        await pool.query(
            `UPDATE subscriptions SET status = 'active' WHERE stripe_subscription_id = ?`,
            [subscriptionId]
        );

        // Record payment
        const [subs] = await pool.query(
            `SELECT team_id FROM subscriptions WHERE stripe_subscription_id = ?`,
            [subscriptionId]
        );

        if (subs[0]) {
            await pool.query(
                `INSERT INTO payments (team_id, stripe_payment_intent_id, stripe_invoice_id, amount, currency, status, description)
                 VALUES (?, ?, ?, ?, 'GBP', 'succeeded', 'Monthly subscription')`,
                [subs[0].team_id, invoice.payment_intent, invoice.id, invoice.amount_paid / 100]
            );
        }
    }

    /**
     * Handle failed payment
     */
    static async handlePaymentFailed(invoice) {
        const subscriptionId = invoice.subscription;

        await pool.query(
            `UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = ?`,
            [subscriptionId]
        );
    }

    /**
     * Handle subscription update
     */
    static async handleSubscriptionUpdate(subscription) {
        await pool.query(
            `UPDATE subscriptions SET 
             status = ?, 
             quantity = ?,
             current_period_start = FROM_UNIXTIME(?),
             current_period_end = FROM_UNIXTIME(?),
             cancel_at_period_end = ?
             WHERE stripe_subscription_id = ?`,
            [
                subscription.status,
                subscription.quantity,
                subscription.current_period_start,
                subscription.current_period_end,
                subscription.cancel_at_period_end,
                subscription.id
            ]
        );

        // Update team member limit based on quantity
        const [subs] = await pool.query(
            `SELECT team_id FROM subscriptions WHERE stripe_subscription_id = ?`,
            [subscription.id]
        );

        if (subs[0]) {
            const newLimit = 5 + subscription.quantity;
            await pool.query(
                `UPDATE teams SET member_limit = ? WHERE id = ?`,
                [newLimit, subs[0].team_id]
            );
        }
    }

    /**
     * Handle subscription cancellation
     */
    static async handleSubscriptionDeleted(subscription) {
        await pool.query(
            `UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = ?`,
            [subscription.id]
        );

        // Revert team to free plan
        const [subs] = await pool.query(
            `SELECT team_id FROM subscriptions WHERE stripe_subscription_id = ?`,
            [subscription.id]
        );

        if (subs[0]) {
            await pool.query(
                `UPDATE teams SET plan = 'free', member_limit = 5 WHERE id = ?`,
                [subs[0].team_id]
            );
        }
    }

    /**
     * Cancel subscription
     * POST /api/billing/cancel
     */
    static async cancelSubscription(req, res) {
        try {
            if (!stripe) {
                return res.status(503).json({
                    success: false,
                    message: 'Stripe not configured'
                });
            }

            const teamId = req.teamId;

            const [subs] = await pool.query(
                `SELECT stripe_subscription_id FROM subscriptions WHERE team_id = ? AND status = 'active'`,
                [teamId]
            );

            if (!subs[0]) {
                return res.status(400).json({
                    success: false,
                    message: 'No active subscription found'
                });
            }

            // Cancel at period end (not immediately)
            await stripe.subscriptions.update(subs[0].stripe_subscription_id, {
                cancel_at_period_end: true
            });

            await pool.query(
                `UPDATE subscriptions SET cancel_at_period_end = TRUE WHERE stripe_subscription_id = ?`,
                [subs[0].stripe_subscription_id]
            );

            res.json({
                success: true,
                message: 'Subscription will be canceled at the end of the billing period'
            });
        } catch (error) {
            console.error('Cancel subscription error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel subscription'
            });
        }
    }

    /**
     * Get payment history
     * GET /api/billing/payments
     */
    static async getPayments(req, res) {
        try {
            const teamId = req.teamId;

            const [payments] = await pool.query(
                `SELECT * FROM payments WHERE team_id = ? ORDER BY created_at DESC LIMIT 50`,
                [teamId]
            );

            res.json({
                success: true,
                data: payments
            });
        } catch (error) {
            console.error('Get payments error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get payment history'
            });
        }
    }
}

module.exports = BillingController;
