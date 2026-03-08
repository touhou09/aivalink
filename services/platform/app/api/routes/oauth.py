"""OAuth routes for Google and Kakao social login."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
import httpx
from sqlalchemy import select

from app.config import get_settings
from app.db.models import User, OAuthAccount
from app.api.deps import DbSession
from app.api.routes.auth import create_access_token

router = APIRouter()
settings = get_settings()


class OAuthCallbackRequest(BaseModel):
    code: str
    redirect_uri: str


class OAuthTokenResponse(BaseModel):
    access_token: str
    token_type: str
    is_new_user: bool


async def _get_or_create_oauth_user(
    db: DbSession,
    provider: str,
    provider_user_id: str,
    email: str | None,
    name: str | None,
    avatar_url: str | None,
) -> tuple[User, bool]:
    """Find existing user by OAuth account or create a new one."""
    # Check if OAuth account already linked
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account:
        result = await db.execute(select(User).where(User.id == oauth_account.user_id))
        user = result.scalar_one()
        return user, False

    # Check if user with same email exists (link account)
    user = None
    is_new = False
    if email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email or f"{provider}_{provider_user_id}@oauth.aivalink",
            username=f"{provider}_{provider_user_id}",
            hashed_password="",  # OAuth users don't have passwords
            display_name=name or f"{provider} user",
            auth_provider=provider,
            avatar_url=avatar_url,
        )
        db.add(user)
        await db.flush()
        is_new = True

    # Create OAuth account link
    oauth_account = OAuthAccount(
        user_id=user.id,
        provider=provider,
        provider_user_id=provider_user_id,
        provider_email=email,
        provider_name=name,
        provider_avatar_url=avatar_url,
    )
    db.add(oauth_account)
    await db.commit()
    await db.refresh(user)
    return user, is_new


@router.post("/google/callback", response_model=OAuthTokenResponse)
async def google_callback(body: OAuthCallbackRequest, db: DbSession):
    """Exchange Google auth code for token and create/link user."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth not configured",
        )

    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": body.code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": body.redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Google auth code",
            )
        tokens = token_resp.json()

        # Get user info
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get Google user info",
            )
        userinfo = userinfo_resp.json()

    user, is_new = await _get_or_create_oauth_user(
        db=db,
        provider="google",
        provider_user_id=userinfo["id"],
        email=userinfo.get("email"),
        name=userinfo.get("name"),
        avatar_url=userinfo.get("picture"),
    )

    access_token = create_access_token(data={"sub": user.id})
    return OAuthTokenResponse(
        access_token=access_token,
        token_type="bearer",
        is_new_user=is_new,
    )


@router.post("/kakao/callback", response_model=OAuthTokenResponse)
async def kakao_callback(body: OAuthCallbackRequest, db: DbSession):
    """Exchange Kakao auth code for token and create/link user."""
    if not settings.kakao_client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Kakao OAuth not configured",
        )

    async with httpx.AsyncClient() as client:
        # Exchange code for tokens
        token_resp = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.kakao_client_id,
                "client_secret": settings.kakao_client_secret,
                "redirect_uri": body.redirect_uri,
                "code": body.code,
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Kakao auth code",
            )
        tokens = token_resp.json()

        # Get user info
        userinfo_resp = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get Kakao user info",
            )
        userinfo = userinfo_resp.json()

    kakao_account = userinfo.get("kakao_account", {})
    profile = kakao_account.get("profile", {})

    user, is_new = await _get_or_create_oauth_user(
        db=db,
        provider="kakao",
        provider_user_id=str(userinfo["id"]),
        email=kakao_account.get("email"),
        name=profile.get("nickname"),
        avatar_url=profile.get("profile_image_url"),
    )

    access_token = create_access_token(data={"sub": user.id})
    return OAuthTokenResponse(
        access_token=access_token,
        token_type="bearer",
        is_new_user=is_new,
    )
