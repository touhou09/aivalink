import { useCallback, useEffect, useState } from "react";
import {
  Box,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Spinner,
  useColorModeValue,
  Link,
  Divider,
} from "@chakra-ui/react";
import { FiBell, FiCheck, FiExternalLink, FiRefreshCw } from "react-icons/fi";
import { useAuthStore } from "../stores/authStore";

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  content: string;
  source_url?: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { token } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const bgColor = useColorModeValue("white", "gray.700");
  const hoverBg = useColorModeValue("gray.50", "gray.600");
  const unreadBg = useColorModeValue("blue.50", "blue.900");

  const fetchNotifications = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/notifications?limit=10", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.items);
        setUnreadCount(data.unread_count);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/v1/notifications/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unread_count);
      }
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, [token]);

  const markAsRead = async (id: string) => {
    if (!token) return;

    try {
      await fetch(`/api/v1/notifications/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_read: true }),
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;

    try {
      await fetch("/api/v1/notifications/mark-all-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const triggerAnalysis = async () => {
    if (!token) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/v1/notifications/trigger-analysis", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        await fetchNotifications();
      }
    } catch (error) {
      console.error("Failed to trigger analysis:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Poll for unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return "Yesterday";
    return date.toLocaleDateString();
  };

  return (
    <Popover placement="bottom-end" onOpen={fetchNotifications}>
      <PopoverTrigger>
        <Box position="relative">
          <IconButton
            aria-label="Notifications"
            icon={<FiBell />}
            variant="ghost"
          />
          {unreadCount > 0 && (
            <Badge
              position="absolute"
              top={0}
              right={0}
              colorScheme="red"
              borderRadius="full"
              fontSize="xs"
              minW={4}
              textAlign="center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Box>
      </PopoverTrigger>

      <PopoverContent w="360px" bg={bgColor}>
        <PopoverHeader fontWeight="bold">
          <HStack justify="space-between">
            <Text>Notifications</Text>
            <HStack>
              <IconButton
                aria-label="Refresh"
                icon={isAnalyzing ? <Spinner size="sm" /> : <FiRefreshCw />}
                size="xs"
                variant="ghost"
                onClick={triggerAnalysis}
                isDisabled={isAnalyzing}
                title="Find new insights"
              />
              {unreadCount > 0 && (
                <Button size="xs" variant="ghost" onClick={markAllAsRead}>
                  Mark all read
                </Button>
              )}
            </HStack>
          </HStack>
        </PopoverHeader>

        <PopoverBody maxH="400px" overflowY="auto" p={0}>
          {isLoading ? (
            <VStack py={8}>
              <Spinner />
              <Text fontSize="sm" color="gray.500">
                Loading...
              </Text>
            </VStack>
          ) : notifications.length === 0 ? (
            <VStack py={8} spacing={2}>
              <Text fontSize="sm" color="gray.500">
                No notifications yet
              </Text>
              <Button
                size="sm"
                leftIcon={<FiRefreshCw />}
                onClick={triggerAnalysis}
                isLoading={isAnalyzing}
              >
                Find Insights
              </Button>
            </VStack>
          ) : (
            <VStack spacing={0} align="stretch">
              {notifications.map((notification, index) => (
                <Box key={notification.id}>
                  {index > 0 && <Divider />}
                  <Box
                    px={4}
                    py={3}
                    bg={notification.is_read ? "transparent" : unreadBg}
                    _hover={{ bg: hoverBg }}
                    cursor="pointer"
                    onClick={() => !notification.is_read && markAsRead(notification.id)}
                  >
                    <HStack justify="space-between" align="start">
                      <VStack align="start" spacing={1} flex={1}>
                        <Text fontWeight="medium" fontSize="sm" noOfLines={1}>
                          {notification.title}
                        </Text>
                        <Text fontSize="xs" color="gray.500" noOfLines={2}>
                          {notification.content}
                        </Text>
                        <Text fontSize="xs" color="gray.400">
                          {formatDate(notification.created_at)}
                        </Text>
                      </VStack>

                      <HStack spacing={1}>
                        {notification.source_url && (
                          <IconButton
                            aria-label="Open source"
                            icon={<FiExternalLink />}
                            size="xs"
                            variant="ghost"
                            as={Link}
                            href={notification.source_url}
                            isExternal
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        {!notification.is_read && (
                          <IconButton
                            aria-label="Mark as read"
                            icon={<FiCheck />}
                            size="xs"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                          />
                        )}
                      </HStack>
                    </HStack>
                  </Box>
                </Box>
              ))}
            </VStack>
          )}
        </PopoverBody>

        {notifications.length > 0 && (
          <PopoverFooter>
            <Button size="sm" variant="ghost" w="full">
              View All
            </Button>
          </PopoverFooter>
        )}
      </PopoverContent>
    </Popover>
  );
}
