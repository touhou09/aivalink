import { useCallback, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Text,
  Tooltip,
  Badge,
  Heading,
} from "@chakra-ui/react";
import { FiMic, FiMicOff, FiSend, FiCamera, FiMonitor, FiX } from "react-icons/fi";
import React from "react";

type InstanceStatus = "stopped" | "starting" | "running" | "stopping" | "error";

interface ChatPanelProps {
  status: InstanceStatus;
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isSTTReady: boolean;
  isCameraActive: boolean;
  isScreenShareActive: boolean;
  currentMessage: string;
  onSendText: (text: string) => void;
  onToggleMic: () => void;
  onOpenCamera: () => void;
  onToggleScreenShare: () => void;
  onCaptureScreenFrame: () => void;
  onStopScreenShare: () => void;
  onInterrupt: () => void;
  screenPreviewRef: React.RefObject<HTMLDivElement>;
}

export function ChatPanel({
  status,
  isSpeaking,
  isListening,
  isSTTReady,
  isCameraActive,
  isScreenShareActive,
  currentMessage,
  onSendText,
  onToggleMic,
  onOpenCamera,
  onToggleScreenShare,
  onCaptureScreenFrame,
  onStopScreenShare,
  onInterrupt,
  screenPreviewRef,
}: ChatPanelProps) {
  const [textInput, setTextInput] = useState("");

  const handleSend = useCallback(() => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  }, [textInput, onSendText]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <Box
      flex={1}
      bg="gray.800"
      borderRadius="lg"
      p={4}
      display="flex"
      flexDirection="column"
    >
      <Heading size="sm" mb={4}>
        Conversation
      </Heading>

      <Box flex={1} overflowY="auto" mb={4}>
        {currentMessage && (
          <Box p={3} bg="gray.700" borderRadius="md">
            <Text>{currentMessage}</Text>
          </Box>
        )}
      </Box>

      {/* Text Input */}
      <HStack mb={4}>
        <Input
          placeholder="Type a message..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyPress={handleKeyPress}
          isDisabled={status !== "running"}
          bg="gray.700"
        />
        <IconButton
          aria-label="Send message"
          icon={<FiSend />}
          onClick={handleSend}
          isDisabled={status !== "running" || !textInput.trim()}
          colorScheme="brand"
        />
      </HStack>

      {/* Mic Button */}
      <HStack justify="center">
        <IconButton
          aria-label={isListening ? "Stop listening" : "Start listening"}
          icon={isListening ? <FiMicOff /> : <FiMic />}
          colorScheme={isListening ? "red" : "brand"}
          size="lg"
          borderRadius="full"
          onClick={onToggleMic}
          isDisabled={status !== "running" || !isSTTReady}
        />
        {!isSTTReady && status === "running" && (
          <Text fontSize="sm" color="gray.500">
            Loading STT...
          </Text>
        )}
      </HStack>

      {/* Vision Buttons */}
      <HStack justify="center" mt={4} spacing={4}>
        <Tooltip label="Open Camera">
          <IconButton
            aria-label="Open camera"
            icon={<FiCamera />}
            colorScheme={isCameraActive ? "green" : "gray"}
            size="md"
            borderRadius="full"
            onClick={onOpenCamera}
            isDisabled={status !== "running"}
          />
        </Tooltip>
        <Tooltip label={isScreenShareActive ? "Stop Screen Share" : "Start Screen Share"}>
          <IconButton
            aria-label={isScreenShareActive ? "Stop screen share" : "Start screen share"}
            icon={<FiMonitor />}
            colorScheme={isScreenShareActive ? "red" : "gray"}
            size="md"
            borderRadius="full"
            onClick={onToggleScreenShare}
            isDisabled={status !== "running"}
          />
        </Tooltip>
      </HStack>

      {/* Screen Share Preview (PiP Style) */}
      {isScreenShareActive && (
        <Box
          mt={4}
          position="relative"
          borderRadius="md"
          overflow="hidden"
          border="2px solid"
          borderColor="red.500"
        >
          <Box ref={screenPreviewRef} minH="150px" bg="gray.900" />
          <HStack position="absolute" top={2} right={2} spacing={1}>
            <Badge colorScheme="red" fontSize="xs">
              🔴 Sharing
            </Badge>
          </HStack>
          <HStack justify="center" p={2} bg="gray.800">
            <Button size="xs" colorScheme="green" onClick={onCaptureScreenFrame}>
              📸 Capture Frame
            </Button>
            <Button size="xs" colorScheme="gray" leftIcon={<FiX />} onClick={onStopScreenShare}>
              Stop
            </Button>
          </HStack>
        </Box>
      )}

      {/* Interrupt Button */}
      {isSpeaking && (
        <Button mt={4} colorScheme="orange" size="sm" onClick={onInterrupt}>
          Interrupt
        </Button>
      )}
    </Box>
  );
}
