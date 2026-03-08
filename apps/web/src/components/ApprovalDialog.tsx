import { useEffect, useRef } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Button,
  Code,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { PendingApproval } from "../hooks/useToolApproval";

const AUTO_REJECT_TIMEOUT_MS = 60_000;

const RISK_COLOR: Record<"low" | "medium" | "high", string> = {
  low: "green",
  medium: "yellow",
  high: "red",
};

const ALERT_STATUS: Record<"low" | "medium" | "high", "info" | "warning" | "error"> = {
  low: "info",
  medium: "warning",
  high: "error",
};

interface ApprovalDialogProps {
  approval: PendingApproval | null;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
}

export function ApprovalDialog({ approval, onApprove, onReject }: ApprovalDialogProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-reject after 60s
  useEffect(() => {
    if (!approval) return;

    timerRef.current = setTimeout(() => {
      onReject(approval.taskId);
    }, AUTO_REJECT_TIMEOUT_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [approval, onReject]);

  if (!approval) return null;

  const riskColor = RISK_COLOR[approval.risk];
  const alertStatus = ALERT_STATUS[approval.risk];

  return (
    <Modal isOpen onClose={() => onReject(approval.taskId)} isCentered size="md">
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="gray.800" color="white" borderWidth="1px" borderColor="gray.600">
        <ModalHeader pb={2}>
          <HStack spacing={2}>
            <Text>Tool Execution Request</Text>
            <Badge colorScheme={riskColor} fontSize="xs" textTransform="uppercase">
              {approval.risk} risk
            </Badge>
          </HStack>
        </ModalHeader>

        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Alert status={alertStatus} borderRadius="md" bg={`${riskColor}.900`}>
              <AlertIcon />
              <Text fontSize="sm">{approval.description}</Text>
            </Alert>

            <VStack spacing={2} align="stretch">
              <HStack>
                <Text fontSize="xs" color="gray.400" minW="80px">
                  Tool
                </Text>
                <Code fontSize="xs" bg="gray.700" px={2} py={0.5} borderRadius="sm">
                  {approval.toolName}
                </Code>
              </HStack>

              {approval.actionTarget && (
                <HStack>
                  <Text fontSize="xs" color="gray.400" minW="80px">
                    Target
                  </Text>
                  <Code fontSize="xs" bg="gray.700" px={2} py={0.5} borderRadius="sm" maxW="280px" isTruncated>
                    {approval.actionTarget}
                  </Code>
                </HStack>
              )}
            </VStack>

            <Text fontSize="xs" color="gray.500">
              This request will be automatically rejected in 60 seconds if no action is taken.
            </Text>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3} justify="flex-end">
            <Button
              variant="ghost"
              colorScheme="red"
              size="sm"
              onClick={() => onReject(approval.taskId)}
            >
              Reject
            </Button>
            <Button
              colorScheme="green"
              size="sm"
              onClick={() => onApprove(approval.taskId)}
            >
              Approve
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
