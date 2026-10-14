// Readiness experiment. C++17; select/poll on POSIX, epoll on Linux.
// All writes happen before each observation. No network service or threads.
#include <algorithm>
#include <array>
#include <cerrno>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>

#include <fcntl.h>
#include <poll.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
#ifdef __linux__
#include <sys/epoll.h>
#endif

void check(int result, const char* operation) {
    if (result < 0) {
        throw std::runtime_error(std::string(operation) + ": " + std::strerror(errno));
    }
}

struct SocketPair {
    int fd[2];
    SocketPair() { check(socketpair(AF_UNIX, SOCK_STREAM, 0, fd), "socketpair"); }
    ~SocketPair() { close(fd[0]); close(fd[1]); }
    SocketPair(const SocketPair&) = delete;
    SocketPair& operator=(const SocketPair&) = delete;
};

void nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    check(flags, "F_GETFL");
    check(fcntl(fd, F_SETFL, flags | O_NONBLOCK), "F_SETFL");
}

class Watcher {
public:
    Watcher(std::string mode, int a, int b) : mode_(std::move(mode)), fds_{a, b} {
        if (mode_ == "select" || mode_ == "poll") return;
        if (mode_ != "lt" && mode_ != "et") {
            throw std::runtime_error("mode must be select, poll, lt, or et");
        }
#ifdef __linux__
        epfd_ = epoll_create1(EPOLL_CLOEXEC);
        check(epfd_, "epoll_create1");
        for (unsigned i = 0; i < fds_.size(); ++i) {
            epoll_event event{};
            event.events = EPOLLIN;
            if (mode_ == "et") event.events |= EPOLLET;
            event.data.u32 = i;
            if (epoll_ctl(epfd_, EPOLL_CTL_ADD, fds_[i], &event) < 0) {
                int saved = errno;
                close(epfd_);
                epfd_ = -1;
                errno = saved;
                check(-1, "epoll_ctl");
            }
        }
#else
        throw std::runtime_error("lt and et require Linux; try select or poll here");
#endif
    }

    ~Watcher() { if (epfd_ >= 0) close(epfd_); }
    Watcher(const Watcher&) = delete;
    Watcher& operator=(const Watcher&) = delete;

    // A zero timeout takes a snapshot. This is not a production event loop.
    void observe(const char* stage) {
        std::array<bool, 2> ready{};
        if (mode_ == "select") {
            int maxfd = std::max(fds_[0], fds_[1]);
            if (maxfd >= FD_SETSIZE) throw std::runtime_error("fd exceeds FD_SETSIZE");
            fd_set reads;
            FD_ZERO(&reads);
            for (int fd : fds_) FD_SET(fd, &reads);
            timeval timeout{};
            check(select(maxfd + 1, &reads, nullptr, nullptr, &timeout), "select");
            for (unsigned i = 0; i < fds_.size(); ++i) ready[i] = FD_ISSET(fds_[i], &reads);
        } else if (mode_ == "poll") {
            pollfd events[] = {{fds_[0], POLLIN, 0}, {fds_[1], POLLIN, 0}};
            check(poll(events, 2, 0), "poll");
            for (unsigned i = 0; i < fds_.size(); ++i) {
                if (events[i].revents & (POLLERR | POLLNVAL)) {
                    throw std::runtime_error("unexpected poll error event");
                }
                ready[i] = (events[i].revents & (POLLIN | POLLHUP)) != 0;
            }
        } else {
#ifdef __linux__
            epoll_event events[2]{};
            int count = epoll_wait(epfd_, events, 2, 0);
            check(count, "epoll_wait");
            for (int i = 0; i < count; ++i) {
                if (events[i].events & EPOLLERR) {
                    throw std::runtime_error("unexpected epoll error event");
                }
                ready.at(events[i].data.u32) = true;
            }
#endif
        }
        std::cout << stage << ":";
        if (ready[0]) std::cout << " A";
        if (ready[1]) std::cout << " B";
        if (!ready[0] && !ready[1]) std::cout << " none";
        std::cout << '\n';
    }

private:
    std::string mode_;
    std::array<int, 2> fds_;
    int epfd_ = -1;
};

void send_bytes(int fd, const std::string& data) {
    std::size_t offset = 0;
    while (offset < data.size()) {
        // The peer stays open, and only eight bytes are sent in this experiment.
        ssize_t count = send(fd, data.data() + offset, data.size() - offset, 0);
        if (count < 0 && errno == EINTR) continue;
        check(static_cast<int>(count), "send");
        if (count == 0) throw std::runtime_error("send made no progress");
        offset += static_cast<std::size_t>(count);
    }
}

void receive(int fd, std::size_t limit) {
    char buffer[16];
    ssize_t count;
    do {
        count = recv(fd, buffer, std::min(limit, sizeof buffer), 0);
    } while (count < 0 && errno == EINTR);
    if (count > 0) {
        std::cout << "recv B: " << count << " bytes ["
                  << std::string(buffer, static_cast<std::size_t>(count)) << "]\n";
    } else if (count == 0) {
        std::cout << "recv B: EOF\n";
    } else if (errno == EAGAIN || errno == EWOULDBLOCK) {
        std::cout << "recv B: EAGAIN/EWOULDBLOCK\n";
    } else {
        check(-1, "recv");
    }
}

int main(int argc, char** argv) {
    try {
        if (argc != 2) {
            std::cerr << "usage: " << argv[0] << " select|poll|lt|et\n";
            return 1;
        }
        SocketPair a;
        SocketPair b;
        nonblocking(a.fd[0]);
        nonblocking(b.fd[0]);
        Watcher watcher(argv[1], a.fd[0], b.fd[0]);

        std::cout << "mode: " << argv[1] << '\n';
        watcher.observe("initial");
        send_bytes(b.fd[1], "abcdefgh");
        watcher.observe("after send 8");
        receive(b.fd[0], 3);
        watcher.observe("after read 3");
        receive(b.fd[0], 16);  // Read even if the preceding observation said none.
        receive(b.fd[0], 16);  // The peer is still open: no bytes means EAGAIN.
        watcher.observe("after drain");
        check(shutdown(b.fd[1], SHUT_WR), "shutdown");
        watcher.observe("after peer shutdown write");
        receive(b.fd[0], 16);  // Now zero means EOF, not temporary emptiness.
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
