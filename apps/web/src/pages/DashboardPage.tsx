import { useEffect } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  Heading,
  Text,
  Card,
  CardBody,
  CardFooter,
  Stack,
  Avatar,
  Badge,
  HStack,
  useToast,
  Spinner,
  Center,
} from "@chakra-ui/react";
import { FiPlus, FiPlay } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { usePersonaStore, Persona } from "../stores/personaStore";
import { useAuthStore } from "../stores/authStore";

function PersonaCard({ persona }: { persona: Persona }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardBody>
        <HStack spacing={4}>
          <Avatar
            size="lg"
            name={persona.character_name}
            src={persona.avatar_url || undefined}
          />
          <Stack spacing={1}>
            <Heading size="md">{persona.name}</Heading>
            <Text fontSize="sm" color="gray.500">
              {persona.character_name}
            </Text>
            <HStack>
              <Badge colorScheme="purple">{persona.llm_provider}</Badge>
              <Badge colorScheme="green">{persona.tts_provider}</Badge>
            </HStack>
          </Stack>
        </HStack>
        {persona.description && (
          <Text mt={4} fontSize="sm" noOfLines={2}>
            {persona.description}
          </Text>
        )}
      </CardBody>
      <CardFooter pt={0}>
        <HStack spacing={2}>
          <Button
            leftIcon={<FiPlay />}
            colorScheme="brand"
            onClick={() => navigate(`/play/${persona.id}`)}
          >
            Start
          </Button>
          <Button
            variant="outline"
            as={Link}
            to={`/personas/${persona.id}/edit`}
          >
            Edit
          </Button>
        </HStack>
      </CardFooter>
    </Card>
  );
}

export default function DashboardPage() {
  const { personas, isLoading, setPersonas, setLoading, setError } =
    usePersonaStore();
  const { token } = useAuthStore();
  const toast = useToast();

  useEffect(() => {
    const fetchPersonas = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/v1/personas", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to fetch personas");
        const data = await response.json();
        setPersonas(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        setError(message);
        toast({
          title: "Error",
          description: message,
          status: "error",
          duration: 5000,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPersonas();
  }, [token, setPersonas, setLoading, setError, toast]);

  if (isLoading) {
    return (
      <Center h="50vh">
        <Spinner size="xl" />
      </Center>
    );
  }

  return (
    <Container maxW="container.xl">
      <Stack spacing={6}>
        <HStack justify="space-between">
          <Heading>My Personas</Heading>
          <Button leftIcon={<FiPlus />} as={Link} to="/personas/new">
            Create Persona
          </Button>
        </HStack>

        {personas.length === 0 ? (
          <Box textAlign="center" py={12}>
            <Heading size="md" color="gray.500" mb={4}>
              No personas yet
            </Heading>
            <Text color="gray.400" mb={6}>
              Create your first AI VTuber persona to get started
            </Text>
            <Button leftIcon={<FiPlus />} as={Link} to="/personas/new">
              Create Persona
            </Button>
          </Box>
        ) : (
          <Grid
            templateColumns={{
              base: "1fr",
              md: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            }}
            gap={6}
          >
            {personas.map((persona) => (
              <PersonaCard key={persona.id} persona={persona} />
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
