package com.termux.terminal;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;

import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

public final class LocalPtySession {
    public interface Listener {
        void onOutput(String text);
        void onExit(int exitCode);
    }

    private final int masterFd;
    private final int processId;
    private final FileDescriptor descriptor;
    private final FileInputStream input;
    private final FileOutputStream output;
    private final Listener listener;
    private final AtomicBoolean closed = new AtomicBoolean(false);

    public LocalPtySession(
        String shellPath,
        String cwd,
        String[] args,
        String[] environment,
        int rows,
        int columns,
        Listener listener
    ) throws Exception {
        this.listener = listener;
        int[] pid = new int[1];
        masterFd = JNI.createSubprocess(shellPath, cwd, args, environment, pid, rows, columns, 0, 0);
        processId = pid[0];
        if (masterFd < 0 || processId <= 0) {
            throw new IOException("Unable to create the local terminal process");
        }

        descriptor = wrapFileDescriptor(masterFd);
        input = new FileInputStream(descriptor);
        output = new FileOutputStream(descriptor);
    }

    public void start() {
        startOutputReader();
        startExitWatcher();
    }

    public synchronized void write(String text) throws IOException {
        if (closed.get()) return;
        output.write(text.getBytes(StandardCharsets.UTF_8));
        output.flush();
    }

    public void resize(int columns, int rows) {
        if (closed.get()) return;
        try {
            JNI.setPtyWindowSize(masterFd, rows, columns, 0, 0);
        } catch (Exception ignored) {
        }
    }

    public void stop() {
        if (!closed.get()) {
            try {
                Os.kill(processId, OsConstants.SIGTERM);
            } catch (ErrnoException ignored) {
            }
        }
        closeMaster();
    }

    private void startOutputReader() {
        Thread reader = new Thread(() -> {
            try {
                InputStreamReader stream = new InputStreamReader(input, StandardCharsets.UTF_8);
                char[] buffer = new char[4096];
                int count;
                while ((count = stream.read(buffer)) >= 0) {
                    if (count > 0) listener.onOutput(new String(buffer, 0, count));
                }
            } catch (IOException ignored) {
            }
        }, "local-pty-output");
        reader.setDaemon(true);
        reader.start();
    }

    private void startExitWatcher() {
        Thread waiter = new Thread(() -> {
            int exitCode = JNI.waitFor(processId);
            closeMaster();
            listener.onExit(exitCode);
        }, "local-pty-waiter");
        waiter.setDaemon(true);
        waiter.start();
    }

    private void closeMaster() {
        if (closed.compareAndSet(false, true)) {
            JNI.close(masterFd);
            try {
                Field field;
                try {
                    field = FileDescriptor.class.getDeclaredField("descriptor");
                } catch (NoSuchFieldException ignored) {
                    field = FileDescriptor.class.getDeclaredField("fd");
                }
                field.setAccessible(true);
                field.setInt(descriptor, -1);
            } catch (ReflectiveOperationException ignored) {
            }
        }
    }

    private static FileDescriptor wrapFileDescriptor(int fd) throws ReflectiveOperationException {
        FileDescriptor descriptor = new FileDescriptor();
        Field field;
        try {
            field = FileDescriptor.class.getDeclaredField("descriptor");
        } catch (NoSuchFieldException ignored) {
            field = FileDescriptor.class.getDeclaredField("fd");
        }
        field.setAccessible(true);
        field.setInt(descriptor, fd);
        return descriptor;
    }
}
