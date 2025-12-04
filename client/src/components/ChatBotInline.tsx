import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Trash2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatBotInline() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/chat", {
        message,
        conversationHistory: messages,
      });
      return response;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
      console.error("Chat error:", error);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    chatMutation.mutate(userMessage);
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">DocuFlow Assistant</h2>
            <p className="text-sm text-muted-foreground">Powered by GPT-4.1-nano</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearChat}
            data-testid="button-clear-chat"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-medium text-lg mb-2">How can I help?</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                I have access to all your projects and documentation. Ask me anything about your docs!
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput("What projects do I have?");
                    inputRef.current?.focus();
                  }}
                  data-testid="button-suggestion-projects"
                >
                  What projects do I have?
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput("Summarize my documentation");
                    inputRef.current?.focus();
                  }}
                  data-testid="button-suggestion-summarize"
                >
                  Summarize my documentation
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput("Help me organize my pages better");
                    inputRef.current?.focus();
                  }}
                  data-testid="button-suggestion-organize"
                >
                  Help me organize my pages
                </Button>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  data-testid={`message-${msg.role}-${i}`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your documentation..."
            disabled={chatMutation.isPending}
            className="flex-1"
            data-testid="input-chat-message"
          />
          <Button
            type="submit"
            disabled={!input.trim() || chatMutation.isPending}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
