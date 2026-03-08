import {
  Box,
  Button,
  Center,
  Divider,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FiClock, FiPlus, FiTrash2 } from "react-icons/fi";
import { HistoryItem } from "../../lib/websocket/client";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  historyList: HistoryItem[];
  currentHistoryUid: string | undefined;
  onLoadHistory: (uid: string) => void;
  onCreateNew: () => void;
  onDelete: (uid: string) => void;
}

export function HistoryDrawer({
  isOpen,
  onClose,
  historyList,
  currentHistoryUid,
  onLoadHistory,
  onCreateNew,
  onDelete,
}: HistoryDrawerProps) {
  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="sm">
      <DrawerOverlay />
      <DrawerContent bg="gray.800">
        <DrawerCloseButton color="white" />
        <DrawerHeader color="white" borderBottomWidth="1px" borderColor="gray.700">
          <HStack justify="space-between">
            <HStack>
              <FiClock />
              <Text>대화 기록</Text>
            </HStack>
          </HStack>
        </DrawerHeader>
        <DrawerBody>
          <VStack spacing={3} align="stretch" pt={2}>
            <Button
              leftIcon={<FiPlus />}
              colorScheme="brand"
              variant="outline"
              onClick={onCreateNew}
              w="full"
            >
              새 대화 시작
            </Button>
            <Divider borderColor="gray.700" />
            {historyList.length === 0 ? (
              <Center py={8}>
                <VStack spacing={2}>
                  <FiClock size={32} color="gray" />
                  <Text color="gray.500" fontSize="sm">
                    대화 기록이 없습니다
                  </Text>
                </VStack>
              </Center>
            ) : (
              historyList.map((history) => (
                <Box
                  key={history.history_uid}
                  p={3}
                  bg={currentHistoryUid === history.history_uid ? "brand.900" : "gray.700"}
                  borderRadius="md"
                  borderWidth={currentHistoryUid === history.history_uid ? "2px" : "1px"}
                  borderColor={
                    currentHistoryUid === history.history_uid ? "brand.500" : "gray.600"
                  }
                  cursor="pointer"
                  _hover={{ bg: "gray.600" }}
                  onClick={() => onLoadHistory(history.history_uid)}
                >
                  <HStack justify="space-between">
                    <VStack align="start" spacing={1}>
                      <Text color="white" fontSize="sm" fontWeight="medium">
                        {new Date(history.created_at).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      {history.latest_message && (
                        <Text color="gray.400" fontSize="xs" noOfLines={1}>
                          {history.latest_message}
                        </Text>
                      )}
                    </VStack>
                    <IconButton
                      aria-label="Delete history"
                      icon={<FiTrash2 />}
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(history.history_uid);
                      }}
                    />
                  </HStack>
                </Box>
              ))
            )}
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
