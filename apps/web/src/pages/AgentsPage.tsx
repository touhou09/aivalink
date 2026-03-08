import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Heading,
  Text,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  useDisclosure,
  useToast,
  SimpleGrid,
  HStack,
  VStack,
  Spinner,
  Center,
  Card,
  CardBody,
  IconButton,
  Stack,
  Icon,
} from "@chakra-ui/react";
import { FiPlus, FiTrash2, FiEdit2, FiCpu } from "react-icons/fi";
import { useAgentStore, Agent } from "../stores/agentStore";

const STATUS_COLORS: Record<string, string> = {
  active: "green",
  inactive: "gray",
  archived: "red",
};

const AGENT_TYPES = ["assistant", "task", "retrieval", "custom"];
const LLM_PROVIDERS = ["openai", "anthropic", "groq", "ollama"];
const LLM_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"],
  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  ollama: ["llama3", "mistral", "phi3"],
};

interface AgentFormData {
  name: string;
  description: string;
  agent_type: string;
  llm_provider: string;
  llm_model: string;
  system_prompt: string;
  tools: string;
  is_public: boolean;
}

const defaultForm: AgentFormData = {
  name: "",
  description: "",
  agent_type: "assistant",
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
  system_prompt: "",
  tools: "",
  is_public: false,
};

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (id: string) => void;
}) {
  const toolCount = agent.tools?.length ?? 0;

  return (
    <Card variant="outline" _hover={{ shadow: "md" }} transition="box-shadow 0.15s">
      <CardBody>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <HStack spacing={2} minW={0}>
              <Icon as={FiCpu} color="blue.400" flexShrink={0} />
              <Text fontWeight="semibold" isTruncated>
                {agent.name}
              </Text>
            </HStack>
            <Badge colorScheme={STATUS_COLORS[agent.status] ?? "gray"} flexShrink={0}>
              {agent.status}
            </Badge>
          </HStack>

          {agent.description && (
            <Text fontSize="sm" color="gray.500" noOfLines={2}>
              {agent.description}
            </Text>
          )}

          <Stack spacing={1}>
            <HStack fontSize="xs" color="gray.500">
              <Text fontWeight="medium">Type:</Text>
              <Badge variant="subtle" colorScheme="purple" fontSize="xs">
                {agent.agent_type}
              </Badge>
            </HStack>
            <HStack fontSize="xs" color="gray.500">
              <Text fontWeight="medium">Model:</Text>
              <Text>
                {agent.llm_provider} / {agent.llm_model}
              </Text>
            </HStack>
            {toolCount > 0 && (
              <HStack fontSize="xs" color="gray.500">
                <Text fontWeight="medium">Tools:</Text>
                <Badge colorScheme="teal">{toolCount}</Badge>
              </HStack>
            )}
          </Stack>

          <HStack justify="flex-end" pt={1}>
            <IconButton
              aria-label="Edit agent"
              icon={<FiEdit2 />}
              size="sm"
              variant="ghost"
              colorScheme="blue"
              onClick={() => onEdit(agent)}
            />
            <IconButton
              aria-label="Delete agent"
              icon={<FiTrash2 />}
              size="sm"
              variant="ghost"
              colorScheme="red"
              onClick={() => onDelete(agent.id)}
            />
          </HStack>
        </VStack>
      </CardBody>
    </Card>
  );
}

export default function AgentsPage() {
  const { agents, loading, fetchAgents, createAgent, updateAgent, deleteAgent } =
    useAgentStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const toast = useToast();

  const [form, setForm] = useState<AgentFormData>(defaultForm);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const availableModels =
    LLM_MODELS[form.llm_provider] ?? [];

  const openCreate = () => {
    setEditingAgent(null);
    setForm(defaultForm);
    onOpen();
  };

  const openEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setForm({
      name: agent.name,
      description: agent.description ?? "",
      agent_type: agent.agent_type,
      llm_provider: agent.llm_provider,
      llm_model: agent.llm_model,
      system_prompt: agent.system_prompt ?? "",
      tools: (agent.tools ?? []).join(", "),
      is_public: agent.is_public,
    });
    onOpen();
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", status: "warning", duration: 3000 });
      return;
    }

    const payload: Partial<Agent> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      agent_type: form.agent_type,
      llm_provider: form.llm_provider,
      llm_model: form.llm_model,
      system_prompt: form.system_prompt.trim() || null,
      tools: form.tools
        ? form.tools.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      is_public: form.is_public,
    };

    setIsSaving(true);
    try {
      if (editingAgent) {
        await updateAgent(editingAgent.id, payload);
        toast({ title: "Agent updated", status: "success", duration: 2000 });
      } else {
        await createAgent(payload);
        toast({ title: "Agent created", status: "success", duration: 2000 });
      }
      onClose();
    } catch (error) {
      toast({
        title: editingAgent ? "Update failed" : "Create failed",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setPendingDeleteId(id);
    onDeleteOpen();
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteAgent(pendingDeleteId);
      toast({ title: "Agent deleted", status: "success", duration: 2000 });
      onDeleteClose();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  return (
    <Box p={6}>
      <HStack justify="space-between" mb={6}>
        <Heading size="lg">Agents</Heading>
        <Button
          colorScheme="blue"
          leftIcon={<FiPlus />}
          onClick={openCreate}
        >
          Create Agent
        </Button>
      </HStack>

      {loading ? (
        <Center h="40vh">
          <Spinner size="xl" />
        </Center>
      ) : agents.length === 0 ? (
        <Center h="40vh" flexDirection="column" gap={3}>
          <Icon as={FiCpu} boxSize={12} color="gray.300" />
          <Text color="gray.500">No agents yet</Text>
          <Text fontSize="sm" color="gray.400">
            Create your first agent to get started
          </Text>
          <Button colorScheme="blue" size="sm" leftIcon={<FiPlus />} onClick={openCreate}>
            Create Agent
          </Button>
        </Center>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={openEdit}
              onDelete={handleDeleteRequest}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editingAgent ? "Edit Agent" : "Create Agent"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  placeholder="My Agent"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea
                  placeholder="What does this agent do?"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={2}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Agent Type</FormLabel>
                <Select
                  value={form.agent_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, agent_type: e.target.value }))
                  }
                >
                  {AGENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <HStack spacing={4} align="flex-end">
                <FormControl>
                  <FormLabel>LLM Provider</FormLabel>
                  <Select
                    value={form.llm_provider}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        llm_provider: e.target.value,
                        llm_model: LLM_MODELS[e.target.value]?.[0] ?? "",
                      }))
                    }
                  >
                    {LLM_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Model</FormLabel>
                  <Select
                    value={form.llm_model}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, llm_model: e.target.value }))
                    }
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>

              <FormControl>
                <FormLabel>System Prompt</FormLabel>
                <Textarea
                  placeholder="You are a helpful assistant..."
                  value={form.system_prompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, system_prompt: e.target.value }))
                  }
                  rows={5}
                  fontFamily="mono"
                  fontSize="sm"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Tools</FormLabel>
                <Input
                  placeholder="web_search, code_interpreter, ..."
                  value={form.tools}
                  onChange={(e) => setForm((f) => ({ ...f, tools: e.target.value }))}
                />
                <Text fontSize="xs" color="gray.400" mt={1}>
                  Comma-separated list of tool names
                </Text>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSave}
              isLoading={isSaving}
              loadingText={editingAgent ? "Saving..." : "Creating..."}
            >
              {editingAgent ? "Save Changes" : "Create Agent"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Agent</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>Are you sure you want to delete this agent? This action cannot be undone.</Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={onDeleteClose}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={handleDeleteConfirm}
              isLoading={isDeleting}
              loadingText="Deleting..."
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
