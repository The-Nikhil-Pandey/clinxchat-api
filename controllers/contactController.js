const ContactModel = require('../models/contactModel');
const UserModel = require('../models/userModel');

/**
 * Contact Controller - Handles contact operations
 */
class ContactController {

    /**
     * Get all contacts
     * GET /api/contacts
     */
    static async getAll(req, res) {
        try {
            const contacts = await ContactModel.findByUserId(req.user.id);
            res.status(200).json({
                success: true,
                data: contacts
            });
        } catch (error) {
            console.error('Get contacts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get contacts',
                error: error.message
            });
        }
    }

    /**
     * Search contacts
     * GET /api/contacts/search?q=
     */
    static async search(req, res) {
        try {
            const query = req.query.q;
            if (!query) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
            }

            const contacts = await ContactModel.search(req.user.id, query);
            res.status(200).json({
                success: true,
                data: contacts
            });
        } catch (error) {
            console.error('Search contacts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search contacts',
                error: error.message
            });
        }
    }

    /**
     * Add contact
     * POST /api/contacts
     */
    static async add(req, res) {
        try {
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            // Check if user exists
            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if trying to add self
            if (userId === req.user.id) {
                return res.status(400).json({
                    success: false,
                    message: 'You cannot add yourself as a contact'
                });
            }

            // Check if contact already exists
            const exists = await ContactModel.exists(req.user.id, userId);
            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: 'Contact already exists'
                });
            }

            await ContactModel.add(req.user.id, userId);

            res.status(201).json({
                success: true,
                message: 'Contact added successfully',
                data: user
            });
        } catch (error) {
            console.error('Add contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add contact',
                error: error.message
            });
        }
    }

    /**
     * Remove contact
     * DELETE /api/contacts/:userId
     */
    static async remove(req, res) {
        try {
            const contactUserId = parseInt(req.params.userId);

            const removed = await ContactModel.remove(req.user.id, contactUserId);
            if (!removed) {
                return res.status(404).json({
                    success: false,
                    message: 'Contact not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Contact removed successfully'
            });
        } catch (error) {
            console.error('Remove contact error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove contact',
                error: error.message
            });
        }
    }
}

module.exports = ContactController;
