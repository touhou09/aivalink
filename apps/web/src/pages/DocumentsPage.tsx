import { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  Card,
  CardBody,
  Stack,
  HStack,
  VStack,
  Badge,
  useToast,
  Spinner,
  Center,
  Icon,
  Input,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from "@chakra-ui/react";
import { FiUpload, FiFile, FiTrash2, FiSearch } from "react-icons/fi";
import { useAuthStore } from "../stores/authStore";
import { usePersonaStore } from "../stores/personaStore";

interface Document {
  id: string;
  user_id: string;
  persona_id: string | null;
  filename: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  chunk_id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
  document_filename: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { token } = useAuthStore();
  const { personas, setPersonas } = usePersonaStore();
  const toast = useToast();

  // Fetch documents
  const fetchDocuments = async () => {
    try {
      const response = await fetch("/api/v1/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch documents");
      const data = await response.json();
      setDocuments(data.items);
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

  // Fetch personas for dropdown
  const fetchPersonas = async () => {
    try {
      const response = await fetch("/api/v1/personas", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch personas");
      const data = await response.json();
      setPersonas(data);
    } catch (error) {
      console.error("Failed to fetch personas:", error);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchPersonas();
  }, [token]);

  // Handle file upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".md")) {
      toast({
        title: "Invalid file type",
        description: "Only Markdown (.md) files are supported",
        status: "error",
        duration: 3000,
      });
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    if (selectedPersonaId) {
      formData.append("persona_id", selectedPersonaId);
    }

    try {
      const response = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to upload document");
      }

      const newDoc = await response.json();
      setDocuments((prev) => [newDoc, ...prev]);

      toast({
        title: "Document uploaded",
        description: `${file.name} has been processed with ${newDoc.chunk_count} chunks`,
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle document deletion
  const handleDelete = async (docId: string) => {
    try {
      const response = await fetch(`/api/v1/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to delete document");

      setDocuments((prev) => prev.filter((d) => d.id !== docId));

      toast({
        title: "Document deleted",
        status: "success",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch("/api/v1/documents/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          persona_id: selectedPersonaId || null,
          top_k: 5,
        }),
      });

      if (!response.ok) throw new Error("Search failed");

      const data = await response.json();
      setSearchResults(data.results);
      onOpen();
    } catch (error) {
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getPersonaName = (personaId: string | null) => {
    if (!personaId) return "All Personas";
    const persona = personas.find((p) => p.id === personaId);
    return persona?.name || "Unknown";
  };

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
          <Heading>Knowledge Base</Heading>
        </HStack>

        {/* Upload Section */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="sm">Upload Document</Heading>
              <Text fontSize="sm" color="gray.500">
                Upload Markdown (.md) files to give your AI knowledge about you.
                The AI will use this information during conversations.
              </Text>

              <HStack spacing={4}>
                <Select
                  placeholder="All Personas (Shared)"
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  maxW="250px"
                >
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </Select>

                <Input
                  type="file"
                  accept=".md"
                  ref={fileInputRef}
                  onChange={handleUpload}
                  display="none"
                />
                <Button
                  leftIcon={<FiUpload />}
                  onClick={() => fileInputRef.current?.click()}
                  isLoading={isUploading}
                  loadingText="Processing..."
                >
                  Upload .md File
                </Button>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Search Section */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="sm">Search Knowledge</Heading>
              <HStack>
                <Input
                  placeholder="Search your documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button
                  leftIcon={<FiSearch />}
                  onClick={handleSearch}
                  isLoading={isSearching}
                >
                  Search
                </Button>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Documents List */}
        <Card>
          <CardBody>
            <Stack spacing={4}>
              <Heading size="sm">Uploaded Documents</Heading>

              {documents.length === 0 ? (
                <Box textAlign="center" py={8}>
                  <Icon as={FiFile} boxSize={12} color="gray.300" mb={4} />
                  <Text color="gray.500">No documents uploaded yet</Text>
                  <Text fontSize="sm" color="gray.400">
                    Upload your first Markdown file to get started
                  </Text>
                </Box>
              ) : (
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Filename</Th>
                      <Th>Persona</Th>
                      <Th isNumeric>Chunks</Th>
                      <Th isNumeric>Size</Th>
                      <Th>Uploaded</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {documents.map((doc) => (
                      <Tr key={doc.id}>
                        <Td>
                          <HStack>
                            <Icon as={FiFile} color="gray.400" />
                            <Text>{doc.filename}</Text>
                          </HStack>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={doc.persona_id ? "purple" : "gray"}
                          >
                            {getPersonaName(doc.persona_id)}
                          </Badge>
                        </Td>
                        <Td isNumeric>{doc.chunk_count}</Td>
                        <Td isNumeric>{formatFileSize(doc.file_size)}</Td>
                        <Td>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </Td>
                        <Td>
                          <IconButton
                            aria-label="Delete document"
                            icon={<FiTrash2 />}
                            size="sm"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => handleDelete(doc.id)}
                          />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Stack>
          </CardBody>
        </Card>
      </Stack>

      {/* Search Results Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Search Results</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {searchResults.length === 0 ? (
              <Text color="gray.500">No matching content found</Text>
            ) : (
              <Stack spacing={4}>
                {searchResults.map((result) => (
                  <Card key={result.chunk_id} variant="outline">
                    <CardBody>
                      <HStack justify="space-between" mb={2}>
                        <Badge colorScheme="blue">
                          {result.document_filename}
                        </Badge>
                        <Badge colorScheme="green">
                          {(result.similarity * 100).toFixed(1)}% match
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" whiteSpace="pre-wrap">
                        {result.content}
                      </Text>
                    </CardBody>
                  </Card>
                ))}
              </Stack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
}
