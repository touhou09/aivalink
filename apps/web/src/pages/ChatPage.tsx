import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Box,
  Center,
  Flex,
  HStack,
  IconButton,
  Input,
  Progress,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiSend } from "react-icons/fi";
import { useGatewayChat } from "../hooks/useGatewayChat";
import { ApprovalDialog } from "../components/ApprovalDialog";

const EMOTION_EMOJI: Record<string, string> = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
  surprised: "😲",
  neutral: "😐",
  thinking: "🤔",
  embarrassed: "😳",
  excited: "🤩",
  tired: "😴",
};

const TRUST_LABEL: Record<string, string> = {
  stranger: "낯선 사람",
  acquaintance: "아는 사람",
  friend: "친구",
  close_friend: "절친한 친구",
};

const TRUST_COLOR: Record<string, string> = {
  stranger: "gray",
  acquaintance: "blue",
  friend: "green",
  close_friend: "purple",
};

const ENERGY_COLOR = (pct: number) => {
  if (pct >= 66) return "green";
  if (pct >= 33) return "yellow";
  return "red";
};

export default function ChatPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const [inputValue, setInputValue] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { messages, isConnected, emotion, trustLevel, conversationCount, energy, error, sendMessage, pendingApproval, approveToolCall, rejectToolCall } =
    useGatewayChat({
      characterId: characterId ?? "",
      onError: (e) => console.error("[ChatPage]", e),
    });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const content = inputValue.trim();
    if (!content || !isConnected) return;
    sendMessage(content);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const energyPct = energy.max > 0 ? Math.round((energy.current / energy.max) * 100) : 0;

  return (
    <>
    <ApprovalDialog
      approval={pendingApproval}
      onApprove={approveToolCall}
      onReject={rejectToolCall}
    />
    <Flex direction="column" h="100%" bg="gray.900" overflow="hidden">
      {/* Header */}
      <Box px={4} py={3} bg="gray.800" borderBottomWidth="1px" borderColor="gray.700" flexShrink={0}>
        <HStack justify="space-between" flexWrap="wrap" gap={2}>
          <HStack spacing={3}>
            <Avatar size="sm" name={characterId} bg="brand.500" />
            <Box>
              <Text fontWeight="bold" fontSize="sm" color="white">
                {characterId}
              </Text>
              <HStack spacing={1}>
                <Box
                  w={2}
                  h={2}
                  borderRadius="full"
                  bg={isConnected ? "green.400" : "red.400"}
                />
                <Text fontSize="xs" color="gray.400">
                  {isConnected ? "연결됨" : "연결 중..."}
                </Text>
              </HStack>
            </Box>
          </HStack>

          <HStack spacing={3} flexWrap="wrap">
            {/* Emotion badge */}
            <HStack spacing={1}>
              <Text fontSize="lg">{EMOTION_EMOJI[emotion] ?? "😐"}</Text>
              <Badge colorScheme="orange" fontSize="xs">
                {emotion}
              </Badge>
            </HStack>

            {/* Trust level badge */}
            <Badge colorScheme={TRUST_COLOR[trustLevel] ?? "gray"} fontSize="xs">
              {TRUST_LABEL[trustLevel] ?? trustLevel}
              {conversationCount > 0 && ` (${conversationCount})`}
            </Badge>

            {/* Energy bar */}
            <HStack spacing={1} minW="80px">
              <Text fontSize="xs" color="gray.400">
                EN
              </Text>
              <Box flex={1} minW="60px">
                <Progress
                  value={energyPct}
                  size="xs"
                  colorScheme={ENERGY_COLOR(energyPct)}
                  borderRadius="full"
                  bg="gray.700"
                />
              </Box>
              <Text fontSize="xs" color="gray.400">
                {energy.current}/{energy.max}
              </Text>
            </HStack>
          </HStack>
        </HStack>
      </Box>

      {/* Error banner */}
      {error && (
        <Box px={4} py={2} bg="red.900" borderBottomWidth="1px" borderColor="red.700" flexShrink={0}>
          <Text fontSize="xs" color="red.300">
            {error}
          </Text>
        </Box>
      )}

      {/* Message list */}
      <Box flex={1} overflowY="auto" px={4} py={4}>
        {!isConnected && messages.length === 0 ? (
          <Center h="full">
            <VStack spacing={3}>
              <Spinner size="lg" color="brand.400" />
              <Text color="gray.400" fontSize="sm">
                게이트웨이에 연결 중...
              </Text>
            </VStack>
          </Center>
        ) : (
          <VStack spacing={3} align="stretch">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <Flex key={msg.id} justify={isUser ? "flex-end" : "flex-start"}>
                  {!isUser && (
                    <Avatar
                      size="xs"
                      name={characterId}
                      bg="brand.500"
                      mr={2}
                      mt={1}
                      flexShrink={0}
                    />
                  )}
                  <Box maxW="72%">
                    {!isUser && msg.emotion && (
                      <HStack spacing={1} mb={1}>
                        <Text fontSize="sm">{EMOTION_EMOJI[msg.emotion] ?? ""}</Text>
                        <Text fontSize="xs" color="gray.500">
                          {msg.emotion}
                        </Text>
                      </HStack>
                    )}
                    <Box
                      px={3}
                      py={2}
                      borderRadius="lg"
                      bg={isUser ? "blue.600" : "gray.700"}
                      color="white"
                      fontSize="sm"
                      lineHeight="1.6"
                      boxShadow="sm"
                      borderTopRightRadius={isUser ? "sm" : "lg"}
                      borderTopLeftRadius={isUser ? "lg" : "sm"}
                    >
                      {msg.content}
                    </Box>
                    <Text
                      fontSize="xs"
                      color="gray.600"
                      mt={1}
                      textAlign={isUser ? "right" : "left"}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Box>
                </Flex>
              );
            })}
            <div ref={bottomRef} />
          </VStack>
        )}
      </Box>

      {/* Input area */}
      <Box px={4} py={3} bg="gray.800" borderTopWidth="1px" borderColor="gray.700" flexShrink={0}>
        <HStack spacing={2}>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? "메시지를 입력하세요..." : "연결 중..."}
            isDisabled={!isConnected}
            bg="gray.700"
            border="none"
            color="white"
            _placeholder={{ color: "gray.500" }}
            _focus={{ boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)" }}
            borderRadius="lg"
            size="md"
          />
          <IconButton
            aria-label="Send message"
            icon={<FiSend />}
            onClick={handleSend}
            isDisabled={!isConnected || !inputValue.trim()}
            colorScheme="brand"
            borderRadius="lg"
          />
        </HStack>
      </Box>
    </Flex>
    </>
  );
}
