import React from "react";
import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: () => void;
  previewRef: React.RefObject<HTMLDivElement>;
}

export function CameraModal({ isOpen, onClose, onCapture, previewRef }: CameraModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent bg="gray.800">
        <ModalHeader color="white">Camera Preview</ModalHeader>
        <ModalCloseButton color="white" />
        <ModalBody pb={6}>
          <Box ref={previewRef} mb={4} minH="300px" bg="gray.900" borderRadius="md" />
          <HStack justify="center" spacing={4}>
            <Button colorScheme="green" onClick={onCapture}>
              Capture & Send
            </Button>
            <Button variant="outline" colorScheme="gray" onClick={onClose}>
              Close
            </Button>
          </HStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
