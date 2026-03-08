import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Container, Spinner, Text, VStack, useToast } from "@chakra-ui/react";
import { useAuthStore } from "../stores/authStore";

export default function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || !provider) {
      setError("Missing authorization code");
      return;
    }

    const exchangeCode = async () => {
      try {
        const redirectUri = `${window.location.origin}/oauth/callback/${provider}`;
        const response = await fetch(`/api/v1/oauth/${provider}/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirect_uri: redirectUri }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || "OAuth login failed");
        }

        const { access_token } = await response.json();

        // Get user info
        const userResponse = await fetch("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const user = await userResponse.json();

        setAuth(access_token, user);
        toast({
          title: "Login successful",
          status: "success",
          duration: 3000,
        });
        navigate("/");
      } catch (err) {
        const message = err instanceof Error ? err.message : "OAuth login failed";
        setError(message);
        toast({
          title: "Login failed",
          description: message,
          status: "error",
          duration: 5000,
        });
      }
    };

    exchangeCode();
  }, [provider, searchParams, navigate, setAuth, toast]);

  if (error) {
    return (
      <Container maxW="md" py={20}>
        <VStack spacing={4}>
          <Text color="red.400" fontSize="lg">
            {error}
          </Text>
          <Text
            color="brand.500"
            cursor="pointer"
            onClick={() => navigate("/login")}
          >
            Back to Login
          </Text>
        </VStack>
      </Container>
    );
  }

  return (
    <Container maxW="md" py={20}>
      <VStack spacing={4}>
        <Spinner size="xl" color="brand.500" />
        <Text color="gray.500">Completing login...</Text>
      </VStack>
    </Container>
  );
}
