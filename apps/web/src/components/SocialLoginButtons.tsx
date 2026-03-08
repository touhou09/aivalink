import { Button, Stack, Divider, Text, HStack } from "@chakra-ui/react";
import { FcGoogle } from "react-icons/fc";
import { RiKakaoTalkFill } from "react-icons/ri";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID;

function getRedirectUri(provider: string) {
  return `${window.location.origin}/oauth/callback/${provider}`;
}

export default function SocialLoginButtons() {
  const handleGoogle = () => {
    if (!GOOGLE_CLIENT_ID) return;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: getRedirectUri("google"),
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const handleKakao = () => {
    if (!KAKAO_CLIENT_ID) return;
    const params = new URLSearchParams({
      client_id: KAKAO_CLIENT_ID,
      redirect_uri: getRedirectUri("kakao"),
      response_type: "code",
    });
    window.location.href = `https://kauth.kakao.com/oauth/authorize?${params}`;
  };

  const hasOAuth = GOOGLE_CLIENT_ID || KAKAO_CLIENT_ID;
  if (!hasOAuth) return null;

  return (
    <>
      <HStack>
        <Divider />
        <Text fontSize="sm" color="gray.500" whiteSpace="nowrap">
          or continue with
        </Text>
        <Divider />
      </HStack>
      <Stack spacing={3}>
        {GOOGLE_CLIENT_ID && (
          <Button
            variant="outline"
            leftIcon={<FcGoogle />}
            onClick={handleGoogle}
            size="lg"
          >
            Google
          </Button>
        )}
        {KAKAO_CLIENT_ID && (
          <Button
            bg="#FEE500"
            color="#000000"
            leftIcon={<RiKakaoTalkFill />}
            onClick={handleKakao}
            _hover={{ bg: "#FDD835" }}
            size="lg"
          >
            Kakao
          </Button>
        )}
      </Stack>
    </>
  );
}
