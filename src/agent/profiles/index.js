const { copilotLikeProfile } = require('./copilotLikeProfile');

const PROFILE_MAP = {
	[copilotLikeProfile.id]: copilotLikeProfile
};

/**
 * Resolves a profile id to a concrete behavior profile.
 *
 * @param {string} profileId - Requested profile id from settings.
 * @returns {{id:string,buildSystemPrompt:function,buildCompactPrompt:function}}
 */
function resolveProfile(profileId) {
	return PROFILE_MAP[profileId] || copilotLikeProfile;
}

module.exports = {
	resolveProfile
};
