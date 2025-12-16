import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, X, Loader2, Sparkles, FileText, Building2, Layers, Users } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ChatMode = "projects" | "company" | "crm" | "both";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<ChatMode>("both");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/chat", {
        message,
        conversationHistory: messages,
        mode,
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

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

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

  const getModeLabel = () => {
    switch (mode) {
      case "projects": return "Project Documentation";
      case "company": return "Company Documents";
      case "crm": return "CRM Data";
      case "both": return "All Sources";
    }
  };

  const getModeDescription = () => {
    switch (mode) {
      case "projects": return "Searching project documentation only";
      case "company": return "Searching company documents only";
      case "crm": return "Searching CRM clients, contacts, and projects";
      case "both": return "Searching all documentation and CRM data";
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-testid="button-chatbot"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-sm font-medium">DocuFlow Assistant</SheetTitle>
                <p className="text-xs text-muted-foreground">Powered by GPT-4.1-nano</p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearChat}
                className="text-xs"
                data-testid="button-clear-chat"
              >
                Clear
              </Button>
            )}
          </div>
          
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Search scope:</span>
              <span className="text-xs font-medium">{getModeLabel()}</span>
            </div>
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as ChatMode)} className="w-full justify-start gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem 
                    value="projects" 
                    size="sm" 
                    className="flex-1 gap-1.5 text-xs"
                    data-testid="toggle-mode-projects"
                    aria-label="Search project documentation only"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Projects
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Search project documentation only</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem 
                    value="company" 
                    size="sm" 
                    className="flex-1 gap-1.5 text-xs"
                    data-testid="toggle-mode-company"
                    aria-label="Search company documents only"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Company
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Search company documents only</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem 
                    value="crm" 
                    size="sm" 
                    className="flex-1 gap-1.5 text-xs"
                    data-testid="toggle-mode-crm"
                    aria-label="Search CRM data only"
                  >
                    <Users className="h-3.5 w-3.5" />
                    CRM
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Search CRM clients, contacts, and projects</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem 
                    value="both" 
                    size="sm" 
                    className="flex-1 gap-1.5 text-xs"
                    data-testid="toggle-mode-both"
                    aria-label="Search all documentation sources"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    All
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Search all documentation and CRM data</p>
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-1">How can I help?</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {getModeDescription()}. Ask me anything!
                </p>
                <div className="mt-4 space-y-2">
                  {(mode === "projects" || mode === "both") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left text-xs"
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
                        className="w-full justify-start text-left text-xs"
                        onClick={() => {
                          setInput("Summarize my documentation");
                          inputRef.current?.focus();
                        }}
                        data-testid="button-suggestion-summarize"
                      >
                        Summarize my documentation
                      </Button>
                    </>
                  )}
                  {(mode === "company" || mode === "both") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left text-xs"
                        onClick={() => {
                          setInput("What company documents are available?");
                          inputRef.current?.focus();
                        }}
                        data-testid="button-suggestion-company-docs"
                      >
                        What company documents are available?
                      </Button>
                    </>
                  )}
                  {(mode === "crm" || mode === "both") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left text-xs"
                        onClick={() => {
                          setInput("List all my clients");
                          inputRef.current?.focus();
                        }}
                        data-testid="button-suggestion-clients"
                      >
                        List all my clients
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left text-xs"
                        onClick={() => {
                          setInput("Show active CRM projects");
                          inputRef.current?.focus();
                        }}
                        data-testid="button-suggestion-crm-projects"
                      >
                        Show active CRM projects
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
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
                <div className="bg-muted rounded-lg px-3 py-2 text-sm">
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
              placeholder={`Ask about ${mode === "projects" ? "project docs" : mode === "company" ? "company docs" : mode === "crm" ? "CRM data" : "anything"}...`}
              disabled={chatMutation.isPending}
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || chatMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
