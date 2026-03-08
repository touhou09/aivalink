import { useState } from "react";
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  Link as ChakraLink,
  useToast,
  useColorModeValue,
} from "@chakra-ui/react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import SocialLoginButtons from "../components/SocialLoginButtons";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToast();
  const bg = useColorModeValue("white", "gray.800");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Login failed");
      }

      const { access_token } = await response.json();

      // Get user info
      const userResponse = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const user = await userResponse.json();

      setAuth(access_token, user);
      navigate("/");
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxW="md" py={12}>
      <Box bg={bg} p={8} borderRadius="lg" shadow="md">
        <Stack spacing={6}>
          <Heading textAlign="center" color="brand.500">
            AivaLink
          </Heading>
          <Text textAlign="center" color="gray.500">
            Sign in to your account
          </Text>

          <form onSubmit={handleSubmit}>
            <Stack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Username or Email</FormLabel>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username or email"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Password</FormLabel>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </FormControl>

              <Button type="submit" isLoading={isLoading} size="lg">
                Sign In
              </Button>
            </Stack>
          </form>

          <SocialLoginButtons />

          <Text textAlign="center">
            Don't have an account?{" "}
            <ChakraLink as={Link} to="/register" color="brand.500">
              Sign up
            </ChakraLink>
          </Text>
        </Stack>
      </Box>
    </Container>
  );
}
