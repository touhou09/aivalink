import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CloseButton,
  Flex,
  HStack,
  Icon,
  Text,
  useColorModeValue,
  Slide,
} from "@chakra-ui/react";
import { FiDownload, FiSmartphone } from "react-icons/fi";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const bgColor = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after a delay (don't interrupt immediately)
      const hasDeclined = localStorage.getItem("pwa-install-declined");
      if (!hasDeclined) {
        setTimeout(() => setShowPrompt(true), 5000);
      }
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show install prompt
    await deferredPrompt.prompt();

    // Wait for user choice
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted PWA install");
    } else {
      console.log("User dismissed PWA install");
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Remember user's choice for 7 days
    localStorage.setItem("pwa-install-declined", Date.now().toString());
  };

  // Don't render if already installed or no prompt available
  if (isInstalled || !deferredPrompt) {
    return null;
  }

  return (
    <Slide direction="bottom" in={showPrompt} style={{ zIndex: 1000 }}>
      <Box
        position="fixed"
        bottom={0}
        left={0}
        right={0}
        bg={bgColor}
        borderTop="1px"
        borderColor={borderColor}
        p={4}
        shadow="lg"
      >
        <Flex
          maxW="container.lg"
          mx="auto"
          align="center"
          justify="space-between"
          wrap="wrap"
          gap={4}
        >
          <HStack spacing={4}>
            <Icon as={FiSmartphone} boxSize={8} color="brand.500" />
            <Box>
              <Text fontWeight="bold">Install Personalinker</Text>
              <Text fontSize="sm" color="gray.500">
                Add to home screen for the best experience
              </Text>
            </Box>
          </HStack>

          <HStack spacing={2}>
            <Button
              leftIcon={<FiDownload />}
              colorScheme="brand"
              onClick={handleInstall}
            >
              Install
            </Button>
            <CloseButton onClick={handleDismiss} />
          </HStack>
        </Flex>
      </Box>
    </Slide>
  );
}
