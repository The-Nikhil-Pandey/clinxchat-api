const SettingsModel = require('../models/settingsModel');

/**
 * Settings Controller - Handles user settings operations
 */
const SettingsController = {

    /**
     * Get current user's settings
     * GET /api/settings
     */
    async get(req, res) {
        try {
            const userId = req.user.id;
            const settings = await SettingsModel.getByUserId(userId);

            if (!settings) {
                return res.status(404).json({
                    success: false,
                    message: 'Settings not found'
                });
            }

            // Remove internal fields
            const { id, user_id, created_at, updated_at, ...cleanSettings } = settings;

            res.json({
                success: true,
                data: cleanSettings
            });

        } catch (error) {
            console.error('Get settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get settings',
                error: error.message
            });
        }
    },

    /**
     * Update current user's settings
     * PUT /api/settings
     */
    async update(req, res) {
        try {
            const userId = req.user.id;
            const settings = req.body;

            const updatedSettings = await SettingsModel.update(userId, settings);

            if (!updatedSettings) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to update settings'
                });
            }

            // Remove internal fields
            const { id, user_id, created_at, updated_at, ...cleanSettings } = updatedSettings;

            res.json({
                success: true,
                message: 'Settings updated successfully',
                data: cleanSettings
            });

        } catch (error) {
            console.error('Update settings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update settings',
                error: error.message
            });
        }
    }
};

module.exports = SettingsController;
