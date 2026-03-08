import { useState } from "react";
import {
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Stack,
  Textarea,
  useToast,
  Switch,
  FormHelperText,
  Card,
  CardBody,
  HStack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { usePersonaStore } from "../stores/personaStore";

const LLM_PROVIDERS = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Google Gemini" },
];

const TTS_PROVIDERS = [
  { value: "edge_tts", label: "Edge TTS (Free)" },
  { value: "openai_tts", label: "OpenAI TTS" },
  { value: "kokoro", label: "Kokoro (WebGPU - English)" },
];

const LIVE2D_MODELS = [
  { value: "shizuku", label: "Shizuku" },
  { value: "haru", label: "Haru" },
  { value: "mao_pro", label: "Mao Pro" },
];

export default function PersonaCreatePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    persona_prompt: "",
    character_name: "",
    live2d_model_name: "shizuku",
    llm_provider: "ollama",
    llm_model: "qwen2.5:latest",
    llm_api_key: "",
    tts_provider: "edge_tts",
    tts_voice: "en-US-AriaNeural",
    tts_language: "en",
    use_letta: false,
  });

  const { token } = useAuthStore();
  const { addPersona } = usePersonaStore();
  const navigate = useNavigate();
  const toast = useToast();

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/personas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create persona");
      }

      const persona = await response.json();
      addPersona(persona);

      toast({
        title: "Persona created",
        status: "success",
        duration: 3000,
      });
      navigate("/");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxW="container.md">
      <Stack spacing={6}>
        <Heading>Create Persona</Heading>

        <form onSubmit={handleSubmit}>
          <Stack spacing={6}>
            <Card>
              <CardBody>
                <Stack spacing={4}>
                  <Heading size="sm">Basic Information</Heading>

                  <FormControl isRequired>
                    <FormLabel>Persona Name</FormLabel>
                    <Input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="My AI Assistant"
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel>Character Name</FormLabel>
                    <Input
                      name="character_name"
                      value={form.character_name}
                      onChange={handleChange}
                      placeholder="Aria"
                    />
                    <FormHelperText>
                      The name your AI will use to introduce itself
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Description</FormLabel>
                    <Textarea
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      placeholder="A helpful and friendly AI assistant..."
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel>Persona Prompt</FormLabel>
                    <Textarea
                      name="persona_prompt"
                      value={form.persona_prompt}
                      onChange={handleChange}
                      placeholder="You are a helpful AI assistant named Aria. You are friendly, knowledgeable, and always ready to help..."
                      rows={6}
                    />
                    <FormHelperText>
                      Define your AI's personality, behavior, and knowledge
                    </FormHelperText>
                  </FormControl>
                </Stack>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stack spacing={4}>
                  <Heading size="sm">Appearance</Heading>

                  <FormControl>
                    <FormLabel>Live2D Model</FormLabel>
                    <Select
                      name="live2d_model_name"
                      value={form.live2d_model_name}
                      onChange={handleChange}
                    >
                      {LIVE2D_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stack spacing={4}>
                  <Heading size="sm">AI Configuration</Heading>

                  <FormControl>
                    <FormLabel>LLM Provider</FormLabel>
                    <Select
                      name="llm_provider"
                      value={form.llm_provider}
                      onChange={handleChange}
                    >
                      {LLM_PROVIDERS.map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Model</FormLabel>
                    <Input
                      name="llm_model"
                      value={form.llm_model}
                      onChange={handleChange}
                      placeholder="qwen2.5:latest"
                    />
                  </FormControl>

                  {form.llm_provider !== "ollama" && (
                    <FormControl>
                      <FormLabel>API Key</FormLabel>
                      <Input
                        type="password"
                        name="llm_api_key"
                        value={form.llm_api_key}
                        onChange={handleChange}
                        placeholder="sk-..."
                      />
                    </FormControl>
                  )}

                  <FormControl display="flex" alignItems="center">
                    <FormLabel mb={0}>Use Letta (Long-term Memory)</FormLabel>
                    <Switch
                      isChecked={form.use_letta}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          use_letta: e.target.checked,
                        }))
                      }
                    />
                  </FormControl>
                </Stack>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stack spacing={4}>
                  <Heading size="sm">Voice Configuration</Heading>

                  <FormControl>
                    <FormLabel>TTS Provider</FormLabel>
                    <Select
                      name="tts_provider"
                      value={form.tts_provider}
                      onChange={handleChange}
                    >
                      {TTS_PROVIDERS.map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Voice</FormLabel>
                    <Input
                      name="tts_voice"
                      value={form.tts_voice}
                      onChange={handleChange}
                      placeholder="en-US-AriaNeural"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Language</FormLabel>
                    <Select
                      name="tts_language"
                      value={form.tts_language}
                      onChange={handleChange}
                    >
                      <option value="en">English</option>
                      <option value="ko">Korean</option>
                      <option value="ja">Japanese</option>
                      <option value="zh">Chinese</option>
                    </Select>
                  </FormControl>
                </Stack>
              </CardBody>
            </Card>

            <HStack justify="flex-end" spacing={4}>
              <Button variant="ghost" onClick={() => navigate("/")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isLoading}>
                Create Persona
              </Button>
            </HStack>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
