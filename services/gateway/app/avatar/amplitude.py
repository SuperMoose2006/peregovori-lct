"""Local client renderer uses the SAME scheduled PCM as AudioPlayer.

No second audio channel and no server-side estimates of playback time.
This is amplitude animation, not a phoneme/video model.
"""
from app.avatar.presence import PresenceAvatar


class AmplitudeAvatar(PresenceAvatar):
    def capabilities(self):
        caps = super().capabilities()
        caps.lipsync = True
        caps.lipsync_mode = 'amplitude'
        caps.transport = 'local'
        return caps

    def describe(self):
        return 'local SVG mouth driven by scheduled audio amplitude'

    async def set_state(self, state, *, reaction=None):
        # Presence event is otherwise identical; advertise the selected renderer.
        from app.avatar.base import AVATAR_STATES
        self._state = state if state in AVATAR_STATES else 'listening'
        self._publish({'type': 'avatar.state', 'state': self._state,
                       'reaction': reaction, 'persona': self._persona,
                       'lipsync': True, 'lipsync_mode': 'amplitude'})
