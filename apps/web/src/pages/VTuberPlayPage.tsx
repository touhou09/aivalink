import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Center,
  Container,
  Flex,
  Heading,
  HStack,
  IconButton,
  Spinner,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { FiClock, FiSquare } from "react-icons/fi";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useVTuber } from "../hooks/useVTuber";
import { ChatPanel, HistoryDrawer, CameraModal } from "../components/vtuber";

type InstanceStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export default function VTuberPlayPage() {
  const { personaId } = useParams<{ personaId: string }>();
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraPreviewRef = useRef<HTMLDivElement>(null);
  const screenPreviewRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<InstanceStatus>("stopped");
  const [isStarting, setIsStarting] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isEyeTrackingEnabled, setIsEyeTrackingEnabled] = useState(true);

  const { isOpen: isCameraOpen, onOpen: openCamera, onClose: closeCamera } = useDisclosure();
  const { isOpen: isHistoryOpen, onOpen: openHistory, onClose: closeHistory } = useDisclosure();

  const {
    isConnected,
    isSpeaking,
    isListening,
    isSTTReady,
    isCameraActive,
    isScreenShareActive,
    modelInfo,
    historyList,
    currentHistoryUid,
    connect,
    disconnect,
    initializeSTT,
    initializeLive2D,
    startListening,
    stopListening,
    sendTextInput,
    interrupt,
    startCamera,
    stopCamera,
    captureAndSendFrame,
    startScreenShare,
    stopScreenShare,
    captureAndSendScreenFrame,
    fetchHistoryList,
    loadHistory,
    createNewHistory,
    deleteHistory,
    handleLive2DTouch,
    lookAt,
    resetLookAt,
  } = useVTuber({
    onMessage: (message) => setCurrentMessage(message),
    onSpeakingChange: (speaking) => {
      if (!speaking) setCurrentMessage("");
    },
    onError: (error) => {
      toast({ title: "Error", description: error, status: "error", duration: 5000 });
    },
  });

  useEffect(() => { initializeSTT(); }, [initializeSTT]);
  useEffect(() => { if (isConnected) fetchHistoryList(); }, [isConnected, fetchHistoryList]);
  useEffect(() => {
    if (modelInfo?.model_path && canvasRef.current) {
      initializeLive2D(canvasRef.current, `/live2d-models/${modelInfo.model_path}/`);
    }
  }, [modelInfo, initializeLive2D]);
  useEffect(() => () => { disconnect(); }, [disconnect]);

  const startInstance = async () => {
    setIsStarting(true);
    setStatus("starting");
    try {
      const response = await fetch(`/api/v1/instances/${personaId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to start instance");
      }
      const data = await response.json();
      setStatus("running");
      await connect(`ws://${window.location.host}${data.websocket_url}`);
      toast({ title: "VTuber Started", status: "success", duration: 2000 });
    } catch (error) {
      setStatus("error");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsStarting(false);
    }
  };

  const stopInstance = async () => {
    setStatus("stopping");
    try {
      disconnect();
      await fetch(`/api/v1/instances/${personaId}/stop`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus("stopped");
      setCurrentMessage("");
    } catch {
      toast({ title: "Error stopping instance", status: "error", duration: 3000 });
      setStatus("error");
    }
  };

  const toggleMic = useCallback(() => {
    isListening ? stopListening() : startListening();
  }, [isListening, startListening, stopListening]);

  const handleOpenCamera = useCallback(async () => {
    try {
      const videoElement = await startCamera("user");
      openCamera();
      setTimeout(() => {
        if (cameraPreviewRef.current && videoElement) {
          cameraPreviewRef.current.innerHTML = "";
          videoElement.style.width = "100%";
          videoElement.style.borderRadius = "8px";
          cameraPreviewRef.current.appendChild(videoElement);
        }
      }, 100);
    } catch (error) {
      toast({
        title: "Camera Error",
        description: error instanceof Error ? error.message : "Failed to access camera",
        status: "error",
        duration: 3000,
      });
    }
  }, [startCamera, openCamera, toast]);

  const handleCloseCamera = useCallback(() => {
    stopCamera();
    closeCamera();
  }, [stopCamera, closeCamera]);

  const handleCaptureFrame = useCallback(() => {
    captureAndSendFrame("이 이미지에 뭐가 보여?");
    toast({ title: "Frame Captured", description: "Image sent for analysis", status: "success", duration: 2000 });
  }, [captureAndSendFrame, toast]);

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenShareActive) {
      stopScreenShare();
    } else {
      try {
        const videoElement = await startScreenShare();
        setTimeout(() => {
          if (screenPreviewRef.current && videoElement) {
            screenPreviewRef.current.innerHTML = "";
            videoElement.style.width = "100%";
            videoElement.style.borderRadius = "8px";
            screenPreviewRef.current.appendChild(videoElement);
          }
        }, 100);
      } catch (error) {
        toast({
          title: "Screen Share Error",
          description: error instanceof Error ? error.message : "Failed to share screen",
          status: "error",
          duration: 3000,
        });
      }
    }
  }, [isScreenShareActive, startScreenShare, stopScreenShare, toast]);

  const handleCaptureScreenFrame = useCallback(() => {
    captureAndSendScreenFrame("이 화면에 뭐가 보여? 설명해줘.");
    toast({ title: "Screen Frame Captured", description: "Current screen sent for analysis", status: "success", duration: 2000 });
  }, [captureAndSendScreenFrame, toast]);

  const handleLoadHistory = useCallback((historyUid: string) => {
    loadHistory(historyUid);
    closeHistory();
    toast({ title: "History Loaded", description: "Previous conversation restored", status: "success", duration: 2000 });
  }, [loadHistory, closeHistory, toast]);

  const handleCreateNewHistory = useCallback(() => {
    createNewHistory();
    closeHistory();
    toast({ title: "New Conversation", description: "Started a new conversation", status: "success", duration: 2000 });
  }, [createNewHistory, closeHistory, toast]);

  const handleDeleteHistory = useCallback((historyUid: string) => {
    deleteHistory(historyUid);
    toast({ title: "History Deleted", description: "Conversation deleted", status: "info", duration: 2000 });
  }, [deleteHistory, toast]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    handleLive2DTouch(e.clientX - rect.left, e.clientY - rect.top);
  }, [handleLive2DTouch]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEyeTrackingEnabled || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    lookAt(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );
  }, [isEyeTrackingEnabled, lookAt]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (isEyeTrackingEnabled) resetLookAt();
  }, [isEyeTrackingEnabled, resetLookAt]);

  const getStatusColor = () => {
    switch (status) {
      case "running": return "green";
      case "starting":
      case "stopping": return "yellow";
      case "error": return "red";
      default: return "gray";
    }
  };

  return (
    <Container maxW="container.xl" h="calc(100vh - 80px)">
      <Flex direction="column" h="full" gap={4}>
        {/* Top Bar */}
        <HStack justify="space-between">
          <HStack>
            <Button variant="ghost" onClick={() => navigate("/")}>← Back</Button>
            <Badge colorScheme={getStatusColor()} fontSize="md" px={3} py={1}>{status}</Badge>
            {isConnected && <Badge colorScheme="green">Connected</Badge>}
            {isSTTReady && <Badge colorScheme="blue">STT Ready</Badge>}
          </HStack>
          <HStack>
            {status === "running" && (
              <Tooltip label="Chat History">
                <IconButton aria-label="Open chat history" icon={<FiClock />} variant="ghost" onClick={openHistory} />
              </Tooltip>
            )}
            {status === "stopped" ? (
              <Button colorScheme="green" onClick={startInstance} isLoading={isStarting}>Start VTuber</Button>
            ) : (
              <Button colorScheme="red" leftIcon={<FiSquare />} onClick={stopInstance}>Stop</Button>
            )}
          </HStack>
        </HStack>

        <Flex flex={1} gap={4}>
          {/* Live2D Canvas */}
          <Box flex={2} bg="gray.900" borderRadius="lg" overflow="hidden" position="relative">
            {status === "stopped" ? (
              <Center h="full">
                <VStack spacing={4}>
                  <Heading size="md" color="gray.500">VTuber not started</Heading>
                  <Text color="gray.600">Click "Start VTuber" to begin</Text>
                </VStack>
              </Center>
            ) : status === "starting" ? (
              <Center h="full">
                <VStack spacing={4}>
                  <Spinner size="xl" />
                  <Text color="gray.500">Starting VTuber instance...</Text>
                  {!isSTTReady && <Text color="gray.600" fontSize="sm">Loading STT model...</Text>}
                </VStack>
              </Center>
            ) : (
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: "100%", cursor: "pointer" }}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={handleCanvasMouseLeave}
              />
            )}

            {isSpeaking && (
              <Badge position="absolute" bottom={4} left={4} colorScheme="purple" fontSize="md" px={3} py={1}>
                Speaking...
              </Badge>
            )}
            {isListening && (
              <Badge position="absolute" bottom={4} right={4} colorScheme="red" fontSize="md" px={3} py={1}>
                🎤 Listening...
              </Badge>
            )}
            {status === "running" && (
              <Tooltip label={isEyeTrackingEnabled ? "Disable eye tracking" : "Enable eye tracking"}>
                <IconButton
                  aria-label="Toggle eye tracking"
                  icon={<Text fontSize="lg">👁️</Text>}
                  position="absolute"
                  top={4}
                  right={4}
                  size="sm"
                  variant={isEyeTrackingEnabled ? "solid" : "ghost"}
                  colorScheme={isEyeTrackingEnabled ? "brand" : "gray"}
                  onClick={() => setIsEyeTrackingEnabled(!isEyeTrackingEnabled)}
                />
              </Tooltip>
            )}
          </Box>

          {/* Chat/Control Panel */}
          <ChatPanel
            status={status}
            isConnected={isConnected}
            isSpeaking={isSpeaking}
            isListening={isListening}
            isSTTReady={isSTTReady}
            isCameraActive={isCameraActive}
            isScreenShareActive={isScreenShareActive}
            currentMessage={currentMessage}
            onSendText={sendTextInput}
            onToggleMic={toggleMic}
            onOpenCamera={handleOpenCamera}
            onToggleScreenShare={handleToggleScreenShare}
            onCaptureScreenFrame={handleCaptureScreenFrame}
            onStopScreenShare={stopScreenShare}
            onInterrupt={interrupt}
            screenPreviewRef={screenPreviewRef}
          />
        </Flex>
      </Flex>

      <CameraModal
        isOpen={isCameraOpen}
        onClose={handleCloseCamera}
        onCapture={handleCaptureFrame}
        previewRef={cameraPreviewRef}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={closeHistory}
        historyList={historyList}
        currentHistoryUid={currentHistoryUid ?? undefined}
        onLoadHistory={handleLoadHistory}
        onCreateNew={handleCreateNewHistory}
        onDelete={handleDeleteHistory}
      />
    </Container>
  );
}
