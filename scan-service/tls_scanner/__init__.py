"""
Internal TLS scanner package.
Provides domain scanning without external API dependencies.
"""

from .scanner import scan_domain

__all__ = ['scan_domain']